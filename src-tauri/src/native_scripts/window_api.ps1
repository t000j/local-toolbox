Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class ToolboxWindowApi {
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
}
'@ | Out-Null
