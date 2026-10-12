(function () {
  "use strict";

  const GRID_SIZE = 8;
  const CELL_COUNT = GRID_SIZE * GRID_SIZE;
  const GAME_TIME = 60;
  const HIGH_SCORE_KEY = "apple-game-high-score";

  const boardElement = document.querySelector("#board");
  const scoreElement = document.querySelector("#score");
  const highScoreElement = document.querySelector("#high-score");
  const timeElement = document.querySelector("#time");
  const statusElement = document.querySelector("#status");
  const gameOverElement = document.querySelector("#game-over");
  const confettiElement = document.querySelector("#confetti");
  const finalScoreElement = document.querySelector("#final-score");
  const newGameButton = document.querySelector("#new-game");
  const restartButton = document.querySelector("#restart-game");

  let board = [];
  let score = 0;
  let highScore = readHighScore();
  let timeLeft = GAME_TIME;
  let timerId = null;
  let isStarted = false;
  let isGameOver = false;
  let isDragging = false;
  let selectedIndexes = [];
  let pointerId = null;

  function randomNumber() {
    return Math.floor(Math.random() * 9) + 1;
  }

  function createBoard() {
    board = Array.from({ length: CELL_COUNT }, randomNumber);
  }

  function readHighScore() {
    try {
      return Number.parseInt(localStorage.getItem(HIGH_SCORE_KEY), 10) || 0;
    } catch (error) {
      return 0;
    }
  }

  function saveHighScore() {
    try {
      localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
    } catch (error) {
      // Private browsing modes can block storage without affecting the game.
    }
  }

  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  function updateScoreboard() {
    scoreElement.textContent = String(score);
    highScoreElement.textContent = String(highScore);
    timeElement.textContent = formatTime(timeLeft);
    timeElement.parentElement.classList.toggle("is-warning", timeLeft <= 10);
  }

  function setStatus(message, tone) {
    statusElement.textContent = message;
    if (tone) {
      statusElement.dataset.tone = tone;
    } else {
      delete statusElement.dataset.tone;
    }
  }

  function renderBoard() {
    boardElement.replaceChildren();

    board.forEach((value, index) => {
      const tile = document.createElement("button");
      tile.className = "tile";
      tile.type = "button";
      tile.dataset.index = String(index);
      tile.setAttribute("role", "gridcell");
      tile.setAttribute("aria-label", `${index + 1}번 칸, 숫자 ${value}`);
      const apple = document.createElement("span");
      apple.className = "apple";
      apple.textContent = "🍎";
      const number = document.createElement("span");
      number.className = "tile-number";
      number.textContent = String(value);
      tile.append(apple, number);
      boardElement.append(tile);
    });
  }

  function collapseColumns(removedIndexes) {
    const removed = new Set(removedIndexes);

    for (let column = 0; column < GRID_SIZE; column += 1) {
      const survivors = [];
      for (let row = GRID_SIZE - 1; row >= 0; row -= 1) {
        const index = row * GRID_SIZE + column;
        if (!removed.has(index)) survivors.push(board[index]);
      }

      let writeRow = GRID_SIZE - 1;
      survivors.forEach((value) => {
        board[writeRow * GRID_SIZE + column] = value;
        writeRow -= 1;
      });
      while (writeRow >= 0) {
        board[writeRow * GRID_SIZE + column] = randomNumber();
        writeRow -= 1;
      }
    }
  }

  function celebrateHighScore() {
    const colors = ["#e66d52", "#c9dfd1", "#f1bd5b", "#172b2c", "#f8e2c9"];
    confettiElement.replaceChildren();

    for (let index = 0; index < 72; index += 1) {
      const piece = document.createElement("span");
      piece.className = "confetti-piece";
      piece.style.setProperty("--x", `${Math.random() * 100}%`);
      piece.style.setProperty("--drift", `${(Math.random() - 0.5) * 220}px`);
      piece.style.setProperty("--rotation", `${Math.random() * 360}deg`);
      piece.style.setProperty("--duration", `${1.8 + Math.random() * 1.6}s`);
      piece.style.setProperty("--delay", `${Math.random() * 0.25}s`);
      piece.style.setProperty("--color", colors[index % colors.length]);
      confettiElement.append(piece);
    }

    window.setTimeout(() => confettiElement.replaceChildren(), 4200);
  }

  function getTileFromPoint(clientX, clientY) {
    const element = document.elementFromPoint(clientX, clientY);
    return element && element.closest(".tile");
  }

  function getNeighbors(index) {
    const row = Math.floor(index / GRID_SIZE);
    const column = index % GRID_SIZE;
    const neighbors = [];

    if (row > 0) neighbors.push(index - GRID_SIZE);
    if (row < GRID_SIZE - 1) neighbors.push(index + GRID_SIZE);
    if (column > 0) neighbors.push(index - 1);
    if (column < GRID_SIZE - 1) neighbors.push(index + 1);

    return neighbors;
  }

  function isAdjacent(firstIndex, secondIndex) {
    return getNeighbors(firstIndex).includes(secondIndex);
  }

  function getSelectionSum() {
    return selectedIndexes.reduce((sum, index) => sum + board[index], 0);
  }

  function updateSelectionStyles() {
    const selectedSet = new Set(selectedIndexes);
    boardElement.querySelectorAll(".tile").forEach((tile) => {
      tile.classList.toggle("is-selected", selectedSet.has(Number(tile.dataset.index)));
    });
  }

  function beginSelection(tile) {
    selectedIndexes = [Number(tile.dataset.index)];
    isDragging = true;
    updateSelectionStyles();
    setStatus(`현재 합계 ${getSelectionSum()} · 이어서 선택하세요.`);
  }

  function extendSelection(tile) {
    if (!isDragging || !tile) return;

    const index = Number(tile.dataset.index);
    const lastIndex = selectedIndexes[selectedIndexes.length - 1];
    if (selectedIndexes.includes(index) || !isAdjacent(lastIndex, index)) return;

    selectedIndexes.push(index);
    updateSelectionStyles();
    setStatus(`현재 합계 ${getSelectionSum()} · 10의 배수를 만들어 보세요.`);
  }

  function clearSelectionStyles() {
    boardElement.querySelectorAll(".tile").forEach((tile) => {
      tile.classList.remove("is-selected", "is-invalid", "is-clearing");
    });
  }

  function finishSelection() {
    if (!isDragging) return;

    isDragging = false;
    const sum = getSelectionSum();
    const selection = [...selectedIndexes];
    const isValid = sum >= 10 && sum % 10 === 0;

    if (isValid) {
      score += sum;
      let isNewHighScore = false;
      if (score > highScore) {
        highScore = score;
        isNewHighScore = true;
        saveHighScore();
      }
      collapseColumns(selection);
      updateScoreboard();
      if (isNewHighScore) celebrateHighScore();
      selection.forEach((index) => {
        const tile = boardElement.querySelector(`[data-index="${index}"]`);
        if (tile) tile.classList.add("is-clearing");
      });
      setStatus(`성공! ${sum}점을 얻었습니다.`, "success");
      window.setTimeout(renderBoard, 240);
    } else {
      boardElement.querySelectorAll(".tile.is-selected").forEach((tile) => {
        tile.classList.add("is-invalid");
      });
      setStatus(sum < 10 ? `합계 ${sum} · 숫자를 더 이어 보세요.` : `합계 ${sum} · 10의 배수가 아니에요.`, "warning");
      window.setTimeout(clearSelectionStyles, 280);
    }

    selectedIndexes = [];
  }

  function handlePointerDown(event) {
    if (!isStarted || isGameOver || event.button > 0) return;
    const tile = event.target.closest(".tile");
    if (!tile) return;
    event.preventDefault();
    pointerId = event.pointerId;
    boardElement.setPointerCapture(pointerId);
    beginSelection(tile);
  }

  function handlePointerMove(event) {
    if (!isDragging || event.pointerId !== pointerId) return;
    extendSelection(getTileFromPoint(event.clientX, event.clientY));
  }

  function handlePointerUp(event) {
    if (event.pointerId !== pointerId) return;
    finishSelection();
    if (boardElement.hasPointerCapture(pointerId)) {
      boardElement.releasePointerCapture(pointerId);
    }
    pointerId = null;
  }

  function endGame() {
    isStarted = false;
    isGameOver = true;
    isDragging = false;
    selectedIndexes = [];
    window.clearInterval(timerId);
    finalScoreElement.textContent = String(score);
    gameOverElement.hidden = false;
    setStatus("시간이 끝났습니다. 새 게임으로 다시 도전하세요.", "warning");
  }

  function startTimer() {
    window.clearInterval(timerId);
    timerId = window.setInterval(() => {
      timeLeft -= 1;
      updateScoreboard();
      if (timeLeft <= 0) endGame();
    }, 1000);
  }

  function startGame() {
    window.clearInterval(timerId);
    score = 0;
    timeLeft = GAME_TIME;
    isStarted = true;
    isGameOver = false;
    isDragging = false;
    selectedIndexes = [];
    gameOverElement.hidden = true;
    createBoard();
    updateScoreboard();
    renderBoard();
    setStatus("숫자를 드래그해 합을 만들어 보세요.");
    newGameButton.textContent = "새 게임";
    startTimer();
  }

  boardElement.addEventListener("pointerdown", handlePointerDown);
  boardElement.addEventListener("pointermove", handlePointerMove);
  boardElement.addEventListener("pointerup", handlePointerUp);
  boardElement.addEventListener("pointercancel", handlePointerUp);
  newGameButton.addEventListener("click", startGame);
  restartButton.addEventListener("click", startGame);

  createBoard();
  updateScoreboard();
  renderBoard();
  newGameButton.textContent = "게임 시작";
  setStatus("게임 시작 버튼을 눌러 60초 게임을 시작하세요.");
})();