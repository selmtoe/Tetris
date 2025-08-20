// AIのWASMモジュールをインポートします
// C++をWASMにコンパイルした際に出力されるJSファイル名を指定してください
importScripts('tetris_ai.js');

const THINK_TIME_MS = 150; // 1手あたりの思考時間 (ミリ秒)
const THINK_STEPS_PER_INTERVAL = 100; // 1回の思考インターバルで実行する探索回数
const INTERVALS = 10; // 思考時間内に何回に分けて思考を実行するか

let Module;

// WASMモジュールの非同期初期化を待ちます
createTetrisAiModule().then(wasmModule => {
    Module = wasmModule;
    // メインスレッドに準備完了を通知します
    self.postMessage({ type: 'aiReady' });
});

// メインスレッドからのメッセージを受信します
self.onmessage = (e) => {
    if (!Module) {
        console.error("AI Module is not ready yet.");
        return;
    }

    const { type, payload } = e.data;

    switch (type) {
        case 'requestMove':
            handleRequestMove(payload);
            break;
        case 'reset':
            Module.resetAI();
            break;
    }
};

// 手の思考をリクエストされた際の処理
function handleRequestMove(payload) {
    const { playerId, board, currentMino, holdMino, nextMinos, b2b, ren } = payload;
    
    // 思考を始める前に、必ずAIの状態を完全にリセットします
    Module.resetAI();
    
    // C++側にゲーム状態を渡します。文字は文字コード(数値)に変換します。
    Module.updateGameState(board, currentMino.charCodeAt(0), holdMino.charCodeAt(0), nextMinos, b2b, ren);

    // 思考を開始します
    Module.startThinking();
    
    // 指定された時間、小分けにして思考を続けます
    let intervalsDone = 0;
    const intervalTime = THINK_TIME_MS / INTERVALS;
    
    const think = () => {
        if (intervalsDone < INTERVALS) {
            Module.thinkSteps(THINK_STEPS_PER_INTERVAL); 
            intervalsDone++;
            setTimeout(think, intervalTime);
        } else {
            // 思考時間が終了したら、最善手を取得してメインスレッドに送ります
            const bestMove = Module.getBestMove();
            self.postMessage({
                type: 'bestMove',
                playerId: playerId,
                payload: bestMove
            });
        }
    };
    
    think();
}
