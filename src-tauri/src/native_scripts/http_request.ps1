Add-Type -AssemblyName System.Net.Http
$uri = [Uri]::new([string]$request.url, [UriKind]::Absolute)
if ($uri.Scheme -notin @('http', 'https') -or $uri.UserInfo -or -not $uri.Host) { throw 'Invalid destination' }
$handler = [Net.Http.HttpClientHandler]::new()
$handler.AllowAutoRedirect = $false
$handler.UseCookies = $false
$handler.UseDefaultCredentials = $false
$handler.UseProxy = $false
$handler.MaxResponseHeadersLength = 16
$handler.ClientCertificateOptions = [Net.Http.ClientCertificateOption]::Manual
$client = [Net.Http.HttpClient]::new($handler)
$client.Timeout = [TimeSpan]::FromSeconds(15)
$cancel = [Threading.CancellationTokenSource]::new(15000)
$message = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::new([string]$request.method), $uri)
$response = $null
$stream = $null
try {
    if ($request.method -notin @('GET', 'HEAD')) {
        $message.Content = [Net.Http.ByteArrayContent]::new([Text.Encoding]::UTF8.GetBytes([string]$request.body))
        $message.Content.Headers.ContentType = [Net.Http.Headers.MediaTypeHeaderValue]::Parse('text/plain; charset=utf-8')
    }
    foreach ($header in $request.headers) {
        if ([string]$header.name -like 'Content-*') {
            if ($null -eq $message.Content) { throw 'Content header requires a body-capable method' }
            $null = $message.Content.Headers.Remove([string]$header.name)
            $message.Content.Headers.Add([string]$header.name, [string]$header.value)
        } else { $message.Headers.Add([string]$header.name, [string]$header.value) }
    }
    $response = $client.SendAsync($message, [Net.Http.HttpCompletionOption]::ResponseHeadersRead, $cancel.Token).GetAwaiter().GetResult()
    [Console]::WriteLine('HTTP/{0} {1} {2}' -f $response.Version, [int]$response.StatusCode, $response.ReasonPhrase)
    $headers = $response.Headers.ToString() + $response.Content.Headers.ToString()
    if ($headers.Length -gt 8192) { $headers = $headers.Substring(0, 8192) + "`n[Response headers truncated]" }
    [Console]::WriteLine($headers)
    [Console]::WriteLine('[Body shown as UTF-8 text; binary/other encodings may be unreadable]')
    $stream = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
    $bytes = [byte[]]::new(32769)
    $length = 0
    while ($length -lt $bytes.Length) {
        $read = $stream.ReadAsync($bytes, $length, ($bytes.Length - $length), $cancel.Token).GetAwaiter().GetResult()
        if ($read -eq 0) { break }
        $length += $read
    }
    [Console]::WriteLine([Text.Encoding]::UTF8.GetString($bytes, 0, [Math]::Min($length, 32768)))
    if ($length -gt 32768) { [Console]::WriteLine('[Body truncated at 32 KiB]') }
} finally {
    if ($null -ne $stream) { $stream.Dispose() }
    if ($null -ne $response) { $response.Dispose() }
    $message.Dispose(); $cancel.Dispose(); $client.Dispose(); $handler.Dispose()
}
