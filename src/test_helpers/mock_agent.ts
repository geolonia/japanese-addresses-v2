import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from 'undici';

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
  // 元の dispatcher を保存して戻す。新しい Agent を作って被せると、入れ子で呼ばれた
  // ときに外側のモックを取り違えるうえ、Agent を作りっぱなしにしてしまう。
  const originalDispatcher = getGlobalDispatcher();
  const mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);
  try {
    await fn(mockAgent);
  } finally {
    // close() より先に復元する。close() が失敗した場合に global dispatcher が
    // 閉じた MockAgent を指したままになると、後続のテストが本来の失敗理由とは
    // 無関係なエラーで落ちて原因究明が難しくなる。
    setGlobalDispatcher(originalDispatcher);
    await mockAgent.close();
  }
}
