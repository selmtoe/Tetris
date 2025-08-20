// 1. Moduleオブジェクトの定義を先に移動します
var Module = {
    // WASMファイルの場所を指定する設定は正しいので、そのまま使います
    locateFile: function(path, prefix) {
        if (path.endsWith('.wasm')) {
            return 'tetris_ai.wasm'; 
        }
        return prefix + path;
    },
    // 2. 初期化完了時に呼ばれるコールバック関数を定義します
    onRuntimeInitialized: function() {
        // この時点でWASMモジュールの準備が完了しています
        console.log("AI Module (WASM) is ready.");
        // メインスレッドに準備完了を通知します
        self.postMessage({ type: 'aiReady' });
    }
};

// 3. Moduleを定義した後に、スクリプトをインポートします
importScripts('tetris_ai.js');


// 4. `createTetrisAiModule` の呼び出しは不要なので削除します
//    Emscriptenのランタイムが自動で初期化を進め、
//    完了したら上で定義した onRuntimeInitialized を呼び出してくれます。


const THINK_TIME_MS = 150; 
const THINK_STEPS_PER_INTERVAL = 100; 
const INTERVALS = 10; 
const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 40;

function boardToUint16Array(board) {
    const uint16Array = new Uint16Array(BOARD_HEIGHT);
    for (let y = 0; y < BOARD_HEIGHT; y++) {
        let row = 0;
        for (let x = 0; x < BOARD_WIDTH; x++) {
            if (board[y] && board[y][x]) { 
                row |= (1 << x);
            }
        }
        uint16Array[y] = row;
    }
    return uint16Array;
}

// self.onmessage以降のコードは変更不要です
self.onmessage = (e) => {
    if (!Module || !Module.updateGameState) { 
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

function handleRequestMove(payload) {
    const { playerId, board, currentMino, holdMino, nextMinos, b2b, ren } = payload;
    // C++側のupdateGameStateがcharの代わりにintを受け取るように変更されているため、
    // charCodeAt(0)で文字コードを渡します。
    Module.updateGameState(board, currentMino.charCodeAt(0), holdMino.charCodeAt(0), nextMinos, b2b, ren);
    Module.startThinking();
    let intervalsDone = 0;
    const intervalTime = THINK_TIME_MS / INTERVALS;
    const think = () => {
        if (intervalsDone < INTERVALS) {
            Module.thinkSteps(THINK_STEPS_PER_INTERVAL);
            intervalsDone++;
            setTimeout(think, intervalTime);
        } else {
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

function handleCommitMove(payload) {
    const { move } = payload;
    Module.commitMoveAndPrune(move);
}
