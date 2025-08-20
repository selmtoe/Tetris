importScripts('tetris_ai.js');
var Module = {
    locateFile: function(path, prefix) {
        if (path.endsWith('.wasm')) {
            return 'tetris_ai.wasm';
        }
        return prefix + path;
    }
};

const THINK_TIME_MS = 150;
const THINK_STEPS_PER_INTERVAL = 100;
const INTERVALS = 10;
const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 40;

// この関数はメインスレッド側で使われるため、ワーカー側では不要。
// ただし、他のロジックで必要になる可能性を考慮し、コメントアウトまたは削除してOK。
/*
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
*/

createTetrisAiModule(Module).then(wasmModule => {
    Module = wasmModule;
    self.postMessage({ type: 'aiReady' });
});

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
    // payloadから受け取る 'board' は既にUint16Array形式
    const { playerId, board, currentMino, holdMino, nextMinos, b2b, ren } = payload;
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
