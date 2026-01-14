'use strict';

{
    const size = 5; // ビンゴの大きさ
    const rangePerColumn = 15; // 数値を変化させる範囲
    const max = rangePerColumn * size;

    let prevBingoCount = 0;

    // drawQueue: 1からmaxまで順番に入れた配列をランダムに入れ替えた抽選用配列
    const drawQueue = Array.from({ length: max }, (_, i) => i + 1);
    shuffle(drawQueue);

    // 表示用要素を取得
    const tBody = document.getElementById('bingo-board');
    if (!tBody) throw new Error('テーブルの tbody が見つかりません');
    const numberText = document.getElementById('number-text');
    if (!numberText) throw new Error('数字表示用のテキストが見つかりません');
    const numberBtn = document.getElementById('number-btn');
    if (!numberBtn) throw new Error('数字更新ボタンが見つかりません');

    // ビンゴ作成
    const bingo = createBingo(size, rangePerColumn);
    if (!bingo) throw new Error('盤面生成に失敗しました');

    // ビンゴの大きさ分の結果用配列を準備
    let result = bingo.map(row => row.map(cell => cell === 'FREE')); // 中央のFREEもtrueにする

    // 初回表示
    renderStaticBoard(bingo);
    applyScratch(result);

    // ボタンがクリックされたとき
    numberBtn.addEventListener('click', async () => {

        // 番号を抽選
        if (drawQueue.length === 0) {
            numberText.textContent = '抽選終了';
            numberBtn.disabled = true;
            return;
        }
        const randomNumber = drawQueue.pop();
        // 抽選番号を表示
        await animateDraw(numberText, randomNumber, 700, max); // 0.7秒ロールしてから確定表示

        // 当たり判定フラグ
        let hitAny = false;      // 盤面のどこかに存在したか
        let hitNew = false;      // 「未マーク」のセルに新規ヒットしたか

        // 結果
        for (let r = 0; r < bingo.length; r++) {
            for (let c = 0; c < bingo[r].length; c++) {
                if (bingo[r][c] == randomNumber) {
                    if (!result[r][c]) {        // まだ未マークなら新規ヒット
                        result[r][c] = true;
                        hitNew = true;
                    }
                    hitAny = true;              // 盤面に存在は true
                }
            }
        }
        applyScratch(result); // クリックで差分を適用
        highlightLines(result); // ビンゴまたはリーチしたラインをハイライト

        // 当たったときだけハイライト
        if (hitNew) {
            numberText.classList.add('highlight');
            setTimeout(() => numberText.classList.remove('highlight'), 500);
        }

        const { bingo: bingoCount, reach } = countBingoLines(result); // ビンゴ判定
        const counter = document.getElementById('bingo-count');
        // console.log("横1行目 falses数:", result[0].filter(v => !v).length);
        // console.log("bingoCount:", bingoCount, "reach:", reach);
        if (counter) counter.textContent = `${bingoCount} BINGO / ${reach} REACH`; // ビンゴとリーチを表示

        if (bingoCount > prevBingoCount) {
            launchConfetti({ particles: 180, spread: 70, decay: 0.89, scalar: 0.9 });
        }
        prevBingoCount = bingoCount;
    });

    /*
    * renderStaticBoard: 作成したビンゴ盤面をDOMに反映
    * bingo: 作成したビンゴ盤面の配列
    */
    function renderStaticBoard(bingo) {
        if (!Array.isArray(bingo)) return;

        const frag = document.createDocumentFragment();

        for (let r = 0; r < bingo.length; r++) {
            const tr = document.createElement("tr");
            for (let c = 0; c < bingo[r].length; c++) {
                const td = document.createElement('td');
                td.textContent = String(bingo[r][c]);
                td.dataset.rc = `${r},${c}`; // 座標キーを付与
                td.setAttribute('aria-selected', 'false'); // Ally
                tr.appendChild(td);
            }
            frag.appendChild(tr);
        }
        tBody.replaceChildren(frag);
    }

    /*
    * applyScratch: ビンゴ結果をDOMに反映
    * result: 当選結果の配列
    */
    function applyScratch(result) {
        for (let r = 0; r < result.length; r++) {
            for (let c = 0; c < result[r].length; c++) {
                const td = tBody.querySelector(`td[data-rc="${r},${c}"]`); // 座標キーでtd要素を取得
                if (!td) continue;
                const on = !!result[r][c]; // 真偽値として取得
                td.classList.toggle('scratched', on); // trueでscratchedクラスを付与、falseで除外
                td.setAttribute('aria-selected', on ? 'true' : 'false'); // セル選択属性true/false
            }
        }
    }

    /*
    * createBingo : bingo配列を作成
    * s: 盤面の大きさ。5以上11以下の奇数
    * ran: 正の数かつs*2以上。列ごとにs個の一意な数字を引ける最低条件
    */
    function createBingo(s = 5, ran = 15) { // 特別に指定されなければ5*5、数字変化は15
        if (s <= 0 || ran <= 0) {
            throw new Error('0以下です');
        }
        if (s < 5) {
            throw new Error('盤面が小さすぎます。5以上にしよう');
        }
        if (s > 11) {
            throw new Error('盤面が大きすぎます。11以下にしてね');
        }
        if (s % 2 === 0) {
            throw new Error('盤面が偶数です(FREEを中央に置くため奇数にしてね)');
        }
        if (ran < s * 2) {
            throw new Error('数字範囲幅が小さすぎます。盤面の大きさの2倍より大きくしよう');
        }

        const columns = [];
        const center = Math.floor(s / 2);

        for (let i = 0; i < s; i++) {
            columns[i] = createColumn(i, s, ran);
        }
        columns[center][center] = 'FREE';
        return reverse(columns);
    }

    /*
    * createColumn : bingoの各列を作成する関数。
    * col: 列のインデックス
    * s: 盤面のサイズ
    * ran: 列の範囲幅
    */
    function createColumn(col, s, ran) {
        const source = [];
        for (let i = 0; i < ran; i++) {
            source[i] = i + 1 + ran * col;
        }
        const column = [];
        for (let i = 0; i < s; i++) {
            column[i] = source.splice(Math.floor(Math.random() * source.length), 1)[0];
        }
        return column;
    }

    /*
    * countBingoLines: 当選結果からビンゴ数とリーチ数を計算する
    * mark: 当選結果
    */
    function countBingoLines(mark) {
        const n = mark.length;
        let bingo = 0;
        let reach = 0;

        // 横
        for (let r = 0; r < n; r++) {
            let falses = 0;
            for (const v of mark[r]) {
                if (!v) falses++; // 行の中にfalseがあればカウント
            }
            if (falses === 0) bingo++; // falseが0ならビンゴ
            else if (falses === 1) reach++; // falseが1ならリーチ
        }

        // 縦
        for (let c = 0; c < n; c++) {
            let falses = 0;
            for (let r = 0; r < n; r++) {
                if (!mark[r][c]) falses++; // 列の中にfalseがあればカウント
            }
            if (falses === 0) bingo++;
            else if (falses === 1) reach++;
        }

        // 斜め(左上から右下)
        {
            let falses = 0;
            for (let i = 0; i < n; i++) {
                if (!mark[i][i]) falses++; // 右下に向かってfalseがあればカウント
            }
            if (falses === 0) bingo++;
            else if (falses === 1) reach++;
        }

        // 斜め(右上から左下)
        {
            let falses = 0;
            for (let i = 0; i < n; i++) {
                if (!mark[i][n - 1 - i]) falses++; // 左下に向かってfalseがあればカウント
            }
            if (falses === 0) bingo++;
            else if (falses === 1) reach++;
        }

        return { bingo, reach };
    }
    /*
    * getLineStates: 当選結果から横・縦・斜め(2種)の条件でfalseの合計を計s何する
    * mark: 当選結果
    */
    function getLineStates(mark) {
        const n = mark.length;
        const lines = [];

        // 横
        for (let r = 0; r < n; r++) {
            const cells = [];
            let falses = 0;
            for (let c = 0; c < n; c++) {
                cells.push([r, c]);
                if (!mark[r][c]) falses++;
            }
            lines.push({ cells, falses });
        }

        // 縦
        for (let c = 0; c < n; c++) {
            const cells = [];
            let falses = 0;
            for (let r = 0; r < n; r++) {
                cells.push([r, c]);
                if (!mark[r][c]) falses++;
            }
            lines.push({ cells, falses });
        }

        // 斜め（左上→右下）
        {
            const cells = [];
            let falses = 0;
            for (let i = 0; i < n; i++) {
                cells.push([i, i]);
                if (!mark[i][i]) falses++;
            }
            lines.push({ cells, falses });
        }

        // 斜め（右上→左下）
        {
            const cells = [];
            let falses = 0;
            for (let i = 0; i < n; i++) {
                cells.push([i, n - 1 - i]);
                if (!mark[i][n - 1 - i]) falses++;
            }
            lines.push({ cells, falses });
        }

        return lines; // 各要素: { cells: [[r,c]...], falses: 数 }
    }
    /*
    * highlightLines: 当選結果からビンゴまたはリーチしたラインをハイライトする
    * result: 当選結果
    */
    function highlightLines(result) {
        // 既存ハイライトを全クリア
        tBody.querySelectorAll('.bingo-line, .reach-line')
            .forEach(td => td.classList.remove('bingo-line', 'reach-line'));

        const lines = getLineStates(result); // 列の状態を取得

        for (const line of lines) {
            // clsに追加するクラスを入れていく。
            // falsesが0ならビンゴなのでbingo-lineクラス、1ならリーチなのでreach-lineクラス。
            const cls = (line.falses === 0) ? 'bingo-line'
                : (line.falses === 1) ? 'reach-line'
                    : null;
            if (!cls) continue;

            // lineのcellsには[(0,0),(0,1),(0,2)...]のようにある1ラインの座標ペアがある
            // 座標ペア通りの座標キーをもつtd要素に対し、列の状態に応じたクラスを付与する。
            for (const [r, c] of line.cells) {
                const td = tBody.querySelector(`td[data-rc="${r},${c}"]`);
                if (td) td.classList.add(cls);
            }
        }
    }

    /*
    * animateDraw: 数字をロールする。シャッフルしたデッキを時間で回す。
    * el: 数字を表示するテキスト要素
    * finalNumber: 最後に表示したい数値
    * duration: デッキを回す時間
    * poolMax: 抽選する数字の最大値
    */
    function animateDraw(el, finalNumber, duration = 700, poolMax = max) {
        return new Promise(resolve => {
            // 1からpoolMaxまでの数字の並べたデッキ
            const deck = Array.from({ length: poolMax }, (_, i) => i + 1);
            // シャッフル
            shuffle(deck);

            const start = performance.now(); // 開始時刻
            const speed = 35; // 数字切替間隔(ms)

            const tick = () => {
                const t = performance.now() - start;
                if (t >= duration - 120) {
                    // 確定番号を出して終了
                    el.textContent = String(finalNumber);
                    el.classList.add('pop');
                    setTimeout(() => el.classList.remove('pop'), 200);
                    resolve();
                    return;
                }
                // 経過時間に応じてデッキを巡回
                const idx = Math.floor(t / speed) % deck.length;
                el.textContent = String(deck[idx]);
                requestAnimationFrame(tick);
            };
            tick(); // 1フレーム目を開始
        });
    }

    /*
    * reverse : 行列転置
    * matrix: 反転させたい配列。
    */
    function reverse(matrix) {
        const rowCount = matrix.length;
        const colCount = matrix[0].length;
        const result = Array.from({ length: colCount }, () => Array(rowCount));

        for (let r = 0; r < rowCount; r++) {
            for (let c = 0; c < colCount; c++) {
                result[c][r] = matrix[r][c];
            }
        }
        return result;
    }

    /*
    * shuffle: 配列をランダムに入れ替える
    * a: 配列
    */
    function shuffle(a) {
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    /*
    * launchConfetti: 紙吹雪アニメーション(canvas-confettiを使用)
    *
    */
    function launchConfetti(opts = {}) {
        confetti({
            particleCount: 150,
            spread: 360,               // 全方向に広がる
            origin: { x: 0.5, y: 0.5 }, // 画面中央から発射
            gravity: 2.0,              // ★重力を強める（デフォルトは ~1）
            decay: 0.88,               // ★速度減衰を強める（デフォルト ~0.9〜0.98）
            scalar: 0.9                // 粒の大きさ調整
        });
    }
}