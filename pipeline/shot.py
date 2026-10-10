"""桌面窗口截图工具（Windows）
用法: python pipeline/shot.py <out.png> [--title 窗口标题关键字]
依赖: pillow; 用 ctypes 把窗口置前后抓取屏幕区域。
"""
import ctypes
import sys
import time
from ctypes import wintypes

from PIL import ImageGrab

user32 = ctypes.WinDLL("user32", use_last_error=True)

EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)

RECT = wintypes.RECT


def find_window(keyword):
    """按标题关键字找可见窗口句柄，返回 (hwnd, rect)"""
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
            if r.right - r.left > 50 and r.bottom - r.top > 50:
                found.append((hwnd, (r.left, r.top, r.right, r.bottom), buf.value))
        return True

    user32.EnumWindows(EnumWindowsProc(cb), 0)
    return found


def main():
    out = sys.argv[1]
    kw = "行测刷题"
    if "--title" in sys.argv:
        kw = sys.argv[sys.argv.index("--title") + 1]

    wins = find_window(kw)
    if not wins:
        print("NO_WINDOW_FOUND title=%s" % kw)
        return 1
    hwnd, rect, title = wins[0]
    print("window: %s rect=%s" % (title, rect))

    user32.ShowWindow(hwnd, 9)  # SW_RESTORE
    user32.SetForegroundWindow(hwnd)
    time.sleep(1.0)
    r = RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(r))
    box = (r.left, r.top, r.right, r.bottom)
    img = ImageGrab.grab(bbox=box, all_screens=True)
    img.save(out)
    print("saved %s size=%s" % (out, img.size))
    return 0


if __name__ == "__main__":
    sys.exit(main())
