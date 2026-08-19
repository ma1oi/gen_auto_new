
export function safeEnqueue(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  data: string
): void {
  try {
    controller.enqueue(encoder.encode(data));
  } catch {
    // клиент уже отключился — дальше писать некуда
  }
}

// close() тоже кидает, если уже закрыт — например если оба child.on("close")
// и child.on("error") успели сработать
export function safeClose(controller: ReadableStreamDefaultController<Uint8Array>): void {
  try {
    controller.close();
  } catch {
    // уже закрыт
  }
}
