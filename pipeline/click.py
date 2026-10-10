"""桌面窗口点击驱动（Windows）
用法: python pipeline/click.py <x> <y> [双击间隔ms]
坐标为窗口左上角(含标题栏)相对坐标——即截图 pipeline/shot.py 输出图的像素坐标。
"""
import ctypes
import sys
import time
from ctypes import wintypes

user32 = ctypes.WinDLL("user32", use_last_error=True)

EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
RECT = wintypes.RECT

MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004


def find_window(keyword):
    found = []

    def cb(hwnd, _):
        if not user32.IsWindowVisible(hwnd):
            return True
        n = user32.GetWindowTextLengthW(hwnd)
        if n == 0:
            return True
        buf = ctypes.create_unicode_buffer(n + 1)
        user32.GetWindowTextW(hwnd, buf, n + 1)
        if keyword in buf.value:
            r = RECT()
            user32.GetWindowRect(hwnd, ctypes.byref(r))
            found.append((hwnd, (r.left, r.top, r.right, r.bottom), buf.value))
        return True

    user32.EnumWindows(EnumWindowsProc(cb), 0)
    return found


def click(x, y, kw="行测刷题"):
    wins = find_window(kw)
    if not wins:
        print("NO_WINDOW")
        return 1
    hwnd, (l, t, r, b), title = wins[0]
    user32.SetForegroundWindow(hwnd)
    time.sleep(0.3)
    sx, sy = l + x, t + y
    ctypes.windll.user32.SetCursorPos(sx, sy)
    time.sleep(0.15)
    user32.mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
    time.sleep(0.05)
    user32.mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
    print("clicked %s @shot(%d,%d) screen(%d,%d)" % (title, x, y, sx, sy))
    return 0


if __name__ == "__main__":
    sys.exit(click(int(sys.argv[1]), int(sys.argv[2])))
