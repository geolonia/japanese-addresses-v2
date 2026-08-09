import { MockAgent, setGlobalDispatcher, Agent } from 'undici';

/**
 * undici の MockAgent を有効にして fn を実行し、終了後に必ず元の dispatcher へ戻します。
 *
 * 第三者サービス(httpbin.org、nlftp.mlit.go.jp 等)やDNS解決に依存すると、
 * そのサービスの障害でCIが落ちる。応答をモックに差し替えてオフラインで実行できるようにする。
 *
 * `disableNetConnect()` をここで常時有効化しているのが要点で、モックを定義し忘れた
 * リクエストは実ネットワークに漏れず即エラーになります。テストごとに書くと
 * 1箇所の書き忘れでオフライン性が崩れるため、この関数に集約しています。
 */
export async function withMockAgent(fn: (mockAgent: MockAgent) => Promise<void>): Promise<void> {
  const mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);
  try {
    await fn(mockAgent);
  } finally {
    await mockAgent.close();
    setGlobalDispatcher(new Agent());
  }
}
