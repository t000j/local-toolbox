Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class ToolboxWindowApi {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct MonitorInfo { public int Size; public Rect Monitor, Work; public uint Flags; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rect);
  public delegate bool MonitorEnumProc(IntPtr monitor, IntPtr dc, IntPtr rect, IntPtr parameter);
  [DllImport("user32.dll")] private static extern bool EnumDisplayMonitors(IntPtr dc, IntPtr clip, MonitorEnumProc callback, IntPtr parameter);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  public delegate bool EnumProc(IntPtr window, IntPtr parameter);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr parameter);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern IntPtr GetShellWindow();
  [DllImport("user32.dll")] public static extern IntPtr GetDesktopWindow();
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr window);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetWindowText(IntPtr window, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] private static extern IntPtr GetWindowLongPtr64(IntPtr window, int index);
  [DllImport("user32.dll", EntryPoint="GetWindowLongW")] private static extern int GetWindowLong32(IntPtr window, int index);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr window, int command);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
  public static string Title(IntPtr window) { var text=new StringBuilder(2048); GetWindowText(window,text,text.Capacity); return text.ToString(); }
  public static bool TopMost(IntPtr window) { long style=IntPtr.Size==8?GetWindowLongPtr64(window,-20).ToInt64():GetWindowLong32(window,-20); return (style & 8)!=0; }
  public static Rect[] MonitorWorkAreas() {
    var areas = new List<Rect>();
    MonitorEnumProc callback = delegate(IntPtr monitor, IntPtr dc, IntPtr rect, IntPtr parameter) {
      var info = new MonitorInfo();
      info.Size = Marshal.SizeOf(typeof(MonitorInfo));
      if (!GetMonitorInfo(monitor, ref info)) return false;
      areas.Add(info.Work);
      return true;
    };
    if (!EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, callback, IntPtr.Zero) || areas.Count == 0)
      throw new InvalidOperationException("无法读取显示器工作区，请刷新后重试。");
    return areas.ToArray();
  }
  public static bool HasVisibleTopStrip(Rect target, Rect work) {
    int visibleWidth = Math.Min(target.Right, work.Right) - Math.Max(target.Left, work.Left);
    return visibleWidth >= Math.Min(64, target.Right - target.Left) && target.Top >= work.Top &&
      target.Top + Math.Min(32, target.Bottom - target.Top) <= work.Bottom;
  }
}
'@ | Out-Null

if ([ToolboxWindowApi]::SetThreadDpiAwarenessContext([IntPtr]::new(-4)) -eq [IntPtr]::Zero) {
  throw '无法启用物理像素 DPI 坐标模式，已停止窗口操作。'
}
