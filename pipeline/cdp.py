"""CDP 工具：向桌面应用 WebView 注入/求值 JS
用法: python pipeline/cdp.py "JS表达式"
"""
import asyncio
import json
import sys

import urllib.request
import websockets


def get_ws():
    d = urllib.request.urlopen("http://127.0.0.1:9333/json").read().decode()
    for t in json.loads(d):
        if t["type"] == "page":
            return t["webSocketDebuggerUrl"]
    raise SystemExit("no page target")


async def main():
    expr = sys.argv[1]
    ws_url = get_ws()
    async with websockets.connect(ws_url, max_size=20 * 1024 * 1024) as ws:
        await ws.send(
            json.dumps(
                {"id": 1, "method": "Runtime.enable", "params": {}}
            )
        )
        await ws.send(
            json.dumps(
                {
                    "id": 2,
                    "method": "Runtime.evaluate",
                    "params": {
                        "expression": expr,
                        "returnByValue": True,
                        "awaitPromise": True,
                    },
                }
            )
        )
        errors = []
        for _ in range(200):
            try:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=15))
            except asyncio.TimeoutError:
                break
            if msg.get("method") == "Runtime.exceptionThrown":
                e = msg["params"]["exceptionDetails"]
                txt = e.get("exception", {}).get("description") or e.get("text")
                errors.append(txt)
            if msg.get("id") == 2:
                body = msg.get("result", {})
                if body.get("exceptionDetails"):
                    e = body["exceptionDetails"]
                    txt = e.get("exception", {}).get("description") or e.get("text")
                    print("EVAL-EXCEPTION:", txt[:1500])
                else:
                    r = body.get("result", {})
                    val = r.get("value")
                    if r.get("subtype") == "error":
                        print("EVAL-ERROR:", r.get("description"))
                    else:
                        print(json.dumps(val, ensure_ascii=False, indent=1) if not isinstance(val, str) else val)
                break
        for e in errors:
            print("PAGE-EXCEPTION:", e[:600])


if __name__ == "__main__":
    asyncio.run(main())
