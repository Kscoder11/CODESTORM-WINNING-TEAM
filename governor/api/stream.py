import asyncio
import json
import time
from typing import AsyncGenerator
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/v1/stream", tags=["SSE Streaming"])

# Simple in-memory event bus for SSE listeners
event_subscribers = []

def broadcast_sse_event(event_type: str, data: dict):
    """Broadcast an SSE event payload to all connected subscribers."""
    payload = {
        "event": event_type,
        "data": data,
        "ts": time.time()
    }
    for queue in list(event_subscribers):
        try:
            queue.put_nowait(payload)
        except Exception:
            pass

async def event_generator() -> AsyncGenerator[str, None]:
    queue = asyncio.Queue()
    event_subscribers.append(queue)
    try:
        # Send initial connected heartbeat
        yield f"event: connected\ndata: {json.dumps({'message': 'Connected to Governor SSE stream'})}\n\n"
        
        while True:
            try:
                msg = await asyncio.wait_for(queue.get(), timeout=15.0)
                event_name = msg["event"]
                data_str = json.dumps(msg["data"])
                yield f"event: {event_name}\ndata: {data_str}\n\n"
            except asyncio.TimeoutError:
                # Send periodic SSE ping heartbeat
                yield f"event: ping\ndata: {json.dumps({'ts': time.time()})}\n\n"
    except asyncio.CancelledError:
        pass
    finally:
        if queue in event_subscribers:
            event_subscribers.remove(queue)

@router.get("", response_class=StreamingResponse)
async def sse_event_stream():
    """Real-time SSE event stream endpoint for SOC dashboard listeners."""
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
