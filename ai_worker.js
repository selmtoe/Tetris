// AIのWASMモジュールをインポートします
// C++をWASMにコンパイルした際に出力されるJSファイル名を指定してください
importScripts('tetris_ai.js');

// --- ▼▼▼ 修正箇所1: Moduleオブジェクトを定義してWASMファイルの場所を教える ▼▼▼ ---
// Emscriptenのモジュールオブジェクトを事前に設定します。
// これにより、WASMファイルが見つからないというエラーを防ぎます。
var Module = {
    locateFile: function(path, prefix) {
        if (path.endsWith('.wasm')) {
            return 'tetris_ai.wasm'; // WASMファイルの名前を正確に指定
        }
        return prefix + path;
    }
};
// --- ▲▲▲ 修正箇所1ここまで ▲▲▲ ---

const THINK_TIME_MS = 150; // 1手あたりの思考時間 (ミリ秒)
const THINK_STEPS_PER_INTERVAL = 100; // 1回の思考インターバルで実行する探索回数
const INTERVALS = 10; // 思考時間内に何回に分けて思考を実行するか

// --- ▼▼▼ 修正箇所2: boardToUint16Array関数をこちらに移動 ▼▼▼ ---
const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 40;

// 盤面データをWASMが期待するビットボード形式 (Uint16Array) に変換
function boardToUint16Array(board) {
    // この関数はindex.htmlから移動させる必要があります。
    // Workerはメインスレッドの関数にアクセスできないためです。
    const uint16Array = new Uint16Array(BOARD_HEIGHT);
    for (let y = 0; y < BOARD_HEIGHT; y++) {
        let row = 0;
        for (let x = 0; x < BOARD_WIDTH; x++) {
            if (board[y] && board[y][x]) { // board[y]が存在するかチェック
                row |= (1 << x);
            }
        }
        uint16Array[y] = row;
    }
    return uint16Array;
}
// --- ▲▲▲ 修正箇所2ここまで ▲▲▲ ---


// WASMモジュールの非同期初期化を待ちます
// 修正: `createTetrisAiModule`に設定済みのModuleオブジェクトを渡します
createTetrisAiModule(Module).then(wasmModule => {
    Module = wasmModule;
    // メインスレッドに準備完了を通知します
    self.postMessage({ type: 'aiReady' });
});

// メインスレッドからのメッセージを受信します
self.onmessage = (e) => {
    if (!Module || !Module.updateGameState) { // 修正: Module内の関数が使えるかもチェック
        console.error("AI Module is not ready yet or functions are not available.");
        return;
    }

    const { type, payload } = e.data;

    switch (type) {
        case 'requestMove':
            handleRequestMove(payload);
            break;
        case 'commitMove':
            handleCommitMove(payload);
            break;
        case 'reset':
            Module.resetAI();
            break;
    }
};

// 手の思考をリクエストされた際の処理
function handleRequestMove(payload) {
    const { playerId, board, currentMino, holdMino, nextMinos, b2b, ren } = payload;

    // C++側にゲーム状態を渡します。文字は文字コード(数値)に変換します。
    // 修正: `boardToUint16Array`はWorker内で呼び出す
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

// 実行した手をAIに通知し、探索木を更新する処理
function handleCommitMove(payload) {
    const { move } = payload;
    Module.commitMoveAndPrune(move);
}
