# Exact ordinal matching avoids wildcard/name interpretation; no elevation or Force.
$services = [ServiceProcess.ServiceController]::GetServices()
try {
    if ($request.action -ne 'list') {
        if ($request.confirmed -ne $true) { throw 'Confirmation required' }
        $target = @($services | Where-Object { $_.ServiceName -ceq $request.name })
        if ($target.Count -ne 1) { throw 'Service changed' }
        $service = $target[0]; $service.Refresh()
        if ($service.Status.ToString() -cne $request.expected) { throw 'Stale snapshot' }
        if ($request.action -eq 'start' -and $service.Status -eq 'Stopped') {
            # Avoid implicitly starting dependency services outside confirmed scope.
            if ($service.ServicesDependedOn.Count -ne 0) { throw 'Dependencies unsupported' }
            $service.Start()
            $service.WaitForStatus([ServiceProcess.ServiceControllerStatus]::Running, [TimeSpan]::FromSeconds(8))
        } elseif ($request.action -eq 'stop' -and $service.Status -eq 'Running') {
            if (!$service.CanStop -or $service.DependentServices.Count -ne 0) { throw 'Dependents unsupported' }
            $service.Stop()
            $service.WaitForStatus([ServiceProcess.ServiceControllerStatus]::Stopped, [TimeSpan]::FromSeconds(8))
        } else { throw 'Invalid action' }
        $service.Refresh()
        [Console]::WriteLine((@{ verified = $true; name = $service.ServiceName; state = $service.Status.ToString() } | ConvertTo-Json -Compress))
    } else {
        $count = 0
        foreach ($service in $services) {
            if ($count -ge 500) { [Console]::WriteLine('{"limited":true}'); break }
            try {
                $state = $service.Status.ToString()
                $action = ''
                if ($state -eq 'Stopped' -and $service.ServicesDependedOn.Count -eq 0) { $action = 'start' }
                if ($state -eq 'Running' -and $service.CanStop -and $service.DependentServices.Count -eq 0) { $action = 'stop' }
                [Console]::WriteLine((@{ name = $service.ServiceName; value = $service.DisplayName; state = $state; action = $action; scope = '本机服务' } | ConvertTo-Json -Compress))
                $count++
            } catch { [Console]::WriteLine('{"limited":true}') }
        }
    }
} finally { foreach ($service in $services) { $service.Dispose() } }
