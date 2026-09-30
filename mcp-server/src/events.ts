/**
 * PNG5 MCP Server — Agent Event Bus
 *
 * Lightweight in-process pub/sub used to stream real agent execution
 * events (planning, policy verdicts, tool execution, approvals) to
 * connected website clients over SSE (/api/events).
 *
 * Events only describe work that actually happened; nothing is synthesized.
 */

export interface AgentEvent {
  id: number;
  type: string;
  ts: string;
  data: Record<string, unknown>;
}

type Listener = (event: AgentEvent) => void;

const MAX_BUFFER = 200;

class AgentEventBus {
  private nextId = 1;
  private buffer: AgentEvent[] = [];
  private listeners = new Set<Listener>();

  public emit(type: string, data: Record<string, unknown>): void {
    const event: AgentEvent = {
      id: this.nextId++,
      type,
      ts: new Date().toISOString(),
      data,
    };

    this.buffer.push(event);
    if (this.buffer.length > MAX_BUFFER) {
      this.buffer.shift();
    }

    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch {
        // A broken listener must never break execution.
      }
    }
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public since(lastId: number): AgentEvent[] {
    return this.buffer.filter((event) => event.id > lastId);
  }

  public recent(limit = 50): AgentEvent[] {
    return this.buffer.slice(-limit);
  }
}

export const agentEvents = new AgentEventBus();
