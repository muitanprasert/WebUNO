(function bootstrapUI() {
  const engine = window.UnoCore;

  if (!engine) {
    throw new Error("UNO engine was not loaded.");
  }

  const { UnoGame, CARD_TYPES, AGENT_PLAYERS, COLORS } = engine;
  const HUMAN_INDEX = 0;
  const AGENT_NAME_POOL = ["mom", "dad", "Mint", "William", "Hong", "Nut", "Lego", "Tui"];

  const tableNode = document.getElementById("table");
  const animLayerNode = document.getElementById("anim-layer");
  const wildChoiceLayerNode = document.getElementById("wild-choice-layer");
  const seatsLayerNode = document.getElementById("seats-layer");
  const directionIndicatorNode = document.getElementById("direction-indicator");
  const centerPilesNode = document.getElementById("center-piles");
  const playerHandNode = document.getElementById("player-hand");
  const playerLabelNode = document.querySelector(".player-label");
  const errorBannerNode = document.getElementById("error-banner");
  const winnerBannerNode = document.getElementById("winner-banner");
  const drawPileButton = document.getElementById("draw-pile");
  const newGameButton = document.getElementById("new-game");
  const rulesButton = document.getElementById("rules-button");
  const newGameModalNode = document.getElementById("new-game-modal");
  const newGameFormNode = document.getElementById("new-game-form");
  const playerCountSelectNode = document.getElementById("player-count-select");
  const agentNamesInputNode = document.getElementById("agent-names-input");
  const speedSelectNode = document.getElementById("speed-select");
  const newGameCancelButton = document.getElementById("new-game-cancel");
  const rulesModalNode = document.getElementById("rules-modal");
  const rulesCloseButton = document.getElementById("rules-close");

  if (!tableNode || !animLayerNode || !wildChoiceLayerNode || !seatsLayerNode || !directionIndicatorNode || !centerPilesNode || !playerHandNode || !playerLabelNode || !errorBannerNode || !winnerBannerNode || !drawPileButton || !newGameButton || !rulesButton || !newGameModalNode || !newGameFormNode || !playerCountSelectNode || !agentNamesInputNode || !speedSelectNode || !newGameCancelButton || !rulesModalNode || !rulesCloseButton) {
    throw new Error("Interface elements are missing.");
  }

  let game = null;
  let isAnimating = false;
  let agentTimer = null;
  let humanPostDrawTimer = null;
  let humanBlockedSkipTimer = null;
  let hiddenHumanCardIds = new Set();
  let selectedCardIds = new Set();
  let activeWildColor = null;
  let finishedRanks = new Map();
  let agentNames = new Map();
  let pendingPlayerCount = AGENT_PLAYERS + 1;
  let agentThinkDelayMs = 0;

  function normalizedPlayerCount(value) {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isInteger(parsed)) {
      return AGENT_PLAYERS + 1;
    }
    return Math.max(2, Math.min(8, parsed));
  }

  function openNewGameModal() {
    const currentCount = game ? game.playerCount : pendingPlayerCount;
    playerCountSelectNode.value = String(normalizedPlayerCount(currentCount));
    agentNamesInputNode.value = "";
    speedSelectNode.value = speedLabelFromDelay(agentThinkDelayMs);
    newGameCancelButton.style.display = "inline-flex";
    newGameModalNode.classList.add("visible");
  }

  function closeNewGameModal() {
    newGameModalNode.classList.remove("visible");
  }

  function openRulesModal() {
    rulesModalNode.classList.add("visible");
  }

  function closeRulesModal() {
    rulesModalNode.classList.remove("visible");
  }

  function speedDelayFromLabel(label) {
    if (label === "slow") {
      return 2500;
    }
    if (label === "medium") {
      return 1000;
    }
    return 0;
  }

  function speedLabelFromDelay(delayMs) {
    if (delayMs >= 2500) {
      return "slow";
    }
    if (delayMs >= 1000) {
      return "medium";
    }
    return "fast";
  }

  function parseAgentNames(value) {
    return String(value)
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
  }

  function sleep(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function nextFrame() {
    return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
  }

  function stageRectFrom(rect) {
    const stageRect = tableNode.getBoundingClientRect();
    return {
      left: rect.left - stageRect.left,
      top: rect.top - stageRect.top,
      width: rect.width,
      height: rect.height,
    };
  }

  function cardLabel(card) {
    if (card.type === CARD_TYPES.NUMBER) {
      return String(card.value);
    }
    if (card.type === CARD_TYPES.DRAW_TWO) {
      return "+2";
    }
    if (card.type === CARD_TYPES.BLOCK) {
      return "Skip";
    }
    if (card.type === CARD_TYPES.REVERSE) {
      return "Rev";
    }
    if (card.type === CARD_TYPES.WILD_DRAW_FOUR) {
      return "+4";
    }
    return "Wild";
  }

  function cardColorClass(card) {
    if (card.type === CARD_TYPES.WILD || card.type === CARD_TYPES.WILD_DRAW_FOUR) {
      return "card-wild";
    }
    return `card-${card.color}`;
  }

  function cardImageSrc(card) {
    const colorName = card.color ? `${card.color.charAt(0).toUpperCase()}${card.color.slice(1)}` : null;

    if (card.type === CARD_TYPES.NUMBER) {
      return `./src/card_images/${colorName}_${card.value}.jpg`;
    }

    if (card.type === CARD_TYPES.DRAW_TWO) {
      return `./src/card_images/${colorName}_Draw_2.jpg`;
    }

    if (card.type === CARD_TYPES.BLOCK) {
      return `./src/card_images/${colorName}_Skip.jpg`;
    }

    if (card.type === CARD_TYPES.REVERSE) {
      return card.color === "red"
        ? "./src/card_images/RED_Reverse.jpg"
        : `./src/card_images/${colorName}_Reverse.jpg`;
    }

    if (card.type === CARD_TYPES.WILD_DRAW_FOUR) {
      return "./src/card_images/Wild_Draw_4.jpg";
    }

    return "./src/card_images/Wild.jpg";
  }

  function createCardImage(card, altText) {
    const image = document.createElement("img");
    image.src = cardImageSrc(card);
    image.alt = altText;
    image.draggable = false;
    image.loading = "eager";
    image.decoding = "async";
    image.className = "card-image";
    return image;
  }

  function cardGroupKey(card) {
    if (card.type === CARD_TYPES.NUMBER) {
      return `${card.type}:${card.value}`;
    }
    return card.type;
  }

  function canPlayCard(card, playerIndex) {
    if (game.currentPlayer !== playerIndex) {
      return false;
    }

    if (game.pendingSkips > 0) {
      return card.type === CARD_TYPES.BLOCK;
    }

    if (game.pendingDraw > 0) {
      return cardGroupKey(card) === game.pendingDrawType;
    }

    return game.isPlayableSingle(card, game.handOf(playerIndex));
  }

  function chooseAgentColor(hand) {
    const counts = { red: 0, yellow: 0, green: 0, blue: 0 };

    for (const card of hand) {
      if (card.color && counts[card.color] !== undefined) {
        counts[card.color] += 1;
      }
    }

    return COLORS.reduce((bestColor, color) => (counts[color] > counts[bestColor] ? color : bestColor), COLORS[0]);
  }

  function setStatus(message, isError) {
    errorBannerNode.textContent = message;
    errorBannerNode.classList.toggle("error", Boolean(isError));
  }

  function clearStatus() {
    setStatus("", false);
  }

  function isFinished(playerIndex) {
    return finishedRanks.has(playerIndex);
  }

  function playerDisplayName(playerIndex) {
    return playerIndex === HUMAN_INDEX ? "You" : (agentNames.get(playerIndex) || `Agent ${playerIndex}`);
  }

  function shuffledNames() {
    const names = AGENT_NAME_POOL.slice();
    for (let index = names.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [names[index], names[swapIndex]] = [names[swapIndex], names[index]];
    }
    return names;
  }

  function assignAgentNames(customNames = []) {
    const totalAgents = Math.max(0, game.playerCount - 1);
    const names = customNames.slice(0, totalAgents);
    const fallbackNames = shuffledNames();

    for (const fallbackName of fallbackNames) {
      if (names.length >= totalAgents) {
        break;
      }
      names.push(fallbackName);
    }

    const assigned = new Map();

    for (let playerIndex = 1; playerIndex < game.playerCount; playerIndex += 1) {
      assigned.set(playerIndex, names[playerIndex - 1] || `Agent ${playerIndex}`);
    }

    agentNames = assigned;
  }

  function nextActivePlayer(fromIndex) {
    let candidate = fromIndex;

    for (let index = 0; index < game.playerCount; index += 1) {
      if (!isFinished(candidate)) {
        return candidate;
      }
      candidate = game.nextPlayerIndex(candidate);
    }

    return fromIndex;
  }

  function ensureCurrentActivePlayer() {
    if (!game) {
      return;
    }

    game.currentPlayer = nextActivePlayer(game.currentPlayer);
  }

  function collectNewWinners() {
    const winners = [];

    for (let playerIndex = 0; playerIndex < game.playerCount; playerIndex += 1) {
      if (!isFinished(playerIndex) && game.hands[playerIndex].length === 0) {
        finishedRanks.set(playerIndex, finishedRanks.size + 1);
        winners.push(playerIndex);
      }
    }

    return winners;
  }

  async function showWinnerBanner(playerIndex) {
    const text = playerIndex === HUMAN_INDEX ? "You have won!" : `${playerDisplayName(playerIndex)} has won!`;
    winnerBannerNode.textContent = text;
    winnerBannerNode.classList.add("visible");
    await sleep(1250);
    winnerBannerNode.classList.remove("visible");
    winnerBannerNode.textContent = "";
  }

  async function resolveWinners() {
    const winners = collectNewWinners();

    for (const playerIndex of winners) {
      await showWinnerBanner(playerIndex);

      if (playerIndex === HUMAN_INDEX) {
        startNewGame();
        return true;
      }
    }

    ensureCurrentActivePlayer();
    return false;
  }

  function clearAgentTimer() {
    if (agentTimer !== null) {
      window.clearTimeout(agentTimer);
      agentTimer = null;
    }
  }

  function clearHumanPostDrawTimer() {
    if (humanPostDrawTimer !== null) {
      window.clearTimeout(humanPostDrawTimer);
      humanPostDrawTimer = null;
    }
  }

  function clearHumanBlockedSkipTimer() {
    if (humanBlockedSkipTimer !== null) {
      window.clearTimeout(humanBlockedSkipTimer);
      humanBlockedSkipTimer = null;
    }
  }

  function drawPileRect() {
    return drawPileButton.getBoundingClientRect();
  }

  function topCardRect() {
    const topCard = centerPilesNode.querySelector(".top-card");
    return topCard ? topCard.getBoundingClientRect() : centerPilesNode.getBoundingClientRect();
  }

  function seatNode(playerIndex) {
    return seatsLayerNode.querySelector(`.seat[data-player-index="${playerIndex}"]`);
  }

  function seatStackRect(playerIndex) {
    const seat = seatNode(playerIndex);
    const stack = seat ? seat.querySelector(".stack") : null;
    return (stack || seat || tableNode).getBoundingClientRect();
  }

  function seatSourceCardRect(playerIndex) {
    const seat = seatNode(playerIndex);
    const cards = seat ? seat.querySelectorAll(".stack-card") : [];
    const lastCard = cards.length > 0 ? cards[cards.length - 1] : null;
    return (lastCard || seat || tableNode).getBoundingClientRect();
  }

  function isUsableRect(rect) {
    return Boolean(rect) && rect.width > 6 && rect.height > 6;
  }

  function getAgentPlaySourceRect(playerIndex) {
    const seat = seatNode(playerIndex);
    const stack = seat ? seat.querySelector(".stack") : null;
    const cards = seat ? seat.querySelectorAll(".stack-card") : [];
    const lastCard = cards.length > 0 ? cards[cards.length - 1] : null;

    const candidates = [
      lastCard ? lastCard.getBoundingClientRect() : null,
      stack ? stack.getBoundingClientRect() : null,
      seat ? seat.getBoundingClientRect() : null,
      drawPileRect(),
      tableNode.getBoundingClientRect(),
    ];

    for (const rect of candidates) {
      if (isUsableRect(rect)) {
        return rect;
      }
    }

    return tableNode.getBoundingClientRect();
  }

  function getDrawTargetAnchor(playerIndex) {
    if (playerIndex === HUMAN_INDEX) {
      return playerHandNode.getBoundingClientRect();
    }

    const seat = seatNode(playerIndex);
    const stack = seat ? seat.querySelector(".stack") : null;
    const stackRect = stack ? stack.getBoundingClientRect() : null;
    const seatRect = seat ? seat.getBoundingClientRect() : null;

    if (isUsableRect(stackRect)) {
      return stackRect;
    }
    if (isUsableRect(seatRect)) {
      return seatRect;
    }

    return tableNode.getBoundingClientRect();
  }

  function renderCenterPiles() {
    centerPilesNode.textContent = "";

    const topCard = game.discardPile[game.discardPile.length - 1];
    const topCardNode = document.createElement("div");
    topCardNode.className = `top-card ${cardColorClass(topCard)}`;
    topCardNode.append(createCardImage(topCard, cardLabel(topCard)));
    topCardNode.title = `Top card (${game.currentColor})`;

    if (activeWildColor && (topCard.type === CARD_TYPES.WILD || topCard.type === CARD_TYPES.WILD_DRAW_FOUR)) {
      const chip = document.createElement("div");
      chip.className = `wild-color-chip ${activeWildColor}`;
      topCardNode.append(chip);
    }

    centerPilesNode.append(topCardNode);

    drawPileButton.replaceChildren();
    drawPileButton.textContent = "DRAW";
  }

  function seatCenterY() {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const shortSide = Math.min(viewportWidth, viewportHeight);
    const isVeryShort = viewportHeight < 500;
    const isSmallViewport = viewportWidth <= 780 || viewportHeight <= 900;

    if (isVeryShort) {
      return 40;
    }
    if (viewportWidth <= 420 || shortSide <= 420) {
      return 39;
    }
    if (viewportWidth <= 600 || shortSide <= 560) {
      return 41.5;
    }
    if (isSmallViewport) {
      return 44.5;
    }

    return 50;
  }

  function seatPosition(index, totalPlayers) {
    if (index === HUMAN_INDEX) {
      return { x: 50, y: 90 };
    }

    const step = 360 / totalPlayers;
    const angleDeg = 90 + step * index;
    const angle = (angleDeg * Math.PI) / 180;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const shortSide = Math.min(viewportWidth, viewportHeight);
    const isVeryShort = viewportHeight < 500;
    const isSmallViewport = viewportWidth <= 780 || viewportHeight <= 900;

    let radius = 42;
    if (isVeryShort) {
      radius = 28;
    } else if (viewportWidth <= 420 || shortSide <= 420) {
      radius = 30;
    } else if (viewportWidth <= 600 || shortSide <= 560) {
      radius = 34;
    } else if (viewportWidth <= 780 || viewportHeight <= 900) {
      radius = 38;
    }

    if (totalPlayers > 4) {
      radius -= Math.min(5, totalPlayers - 4);
    }

    const radiusY = Math.max(24, radius - (viewportHeight < 740 ? 4 : 0));
    let radiusX = radius;
    if (viewportWidth <= 420 || shortSide <= 420) {
      radiusX += 14;
    } else if (viewportWidth <= 600 || shortSide <= 560) {
      radiusX += 11;
    } else if (viewportWidth <= 780 || viewportHeight <= 900) {
      radiusX += 6;
    }

    if (totalPlayers === 4 && (viewportWidth <= 780 || shortSide <= 700)) {
      radiusX += 4;
    }

    const centerY = seatCenterY();

    const topLimit = isVeryShort ? 10 : (viewportHeight < 720 ? 11 : 12);
    const bottomLimit = isVeryShort ? 58 : (viewportHeight < 720 ? 64 : 72);

    const position = {
      x: 50 + radiusX * Math.cos(angle),
      y: centerY + radiusY * Math.sin(angle),
    };

    // Keep top-side labels clear of the header and lower seats clear of wrapped hand rows.
    position.y = Math.max(topLimit, Math.min(bottomLimit, position.y));

    return position;
  }

  function seatFacingRotation(position) {
    const centerY = seatCenterY();
    const angleToCenter = Math.atan2(centerY - position.y, 50 - position.x) * (180 / Math.PI);
    // Rotate seat content so each agent faces the table center.
    const rawRotation = angleToCenter + 90;
    if (rawRotation > 180) {
      return rawRotation - 360;
    }
    return rawRotation;
  }

  function createStack(count) {
    const stackNode = document.createElement("div");
    stackNode.className = "stack";

    const rootStyles = window.getComputedStyle(document.documentElement);
    const baseCardWidth = Number.parseFloat(rootStyles.getPropertyValue("--stack-card-width")) || 62;
    const baseCardHeight = Number.parseFloat(rootStyles.getPropertyValue("--stack-card-height")) || 94;
    const viewportWidth = window.innerWidth;
    const compact = game.playerCount > 5;
    const cardWidth = Math.max(28, compact ? baseCardWidth - 6 : baseCardWidth);
    const cardHeight = Math.max(42, compact ? baseCardHeight - 8 : baseCardHeight);
    const visible = Math.min(count, 14);
    const overlapRatio = viewportWidth <= 420 ? 0.28 : (viewportWidth <= 780 ? 0.34 : 0.5);
    const offset = Math.max(8, Math.round(cardWidth * overlapRatio));
    stackNode.style.height = `${cardHeight}px`;
    stackNode.style.width = `${Math.max(28, cardWidth + Math.max(0, visible - 1) * offset)}px`;

    for (let index = 0; index < visible; index += 1) {
      const cardNode = document.createElement("div");
      cardNode.className = "stack-card";
      cardNode.style.width = `${cardWidth}px`;
      cardNode.style.height = `${cardHeight}px`;
      cardNode.style.left = `${index * offset}px`;
      stackNode.append(cardNode);
    }

    return stackNode;
  }

  function renderSeats() {
    seatsLayerNode.textContent = "";
    const totalPlayers = game.playerCount;

    for (let playerIndex = 1; playerIndex < totalPlayers; playerIndex += 1) {
      const position = seatPosition(playerIndex, totalPlayers);
      const seat = document.createElement("div");
      seat.className = "seat";
      seat.dataset.playerIndex = String(playerIndex);

      seat.style.left = `${position.x}%`;
      seat.style.top = `${position.y}%`;
      seat.style.transform = `translate(-50%, -50%) rotate(${seatFacingRotation(position)}deg)`;

      const nameNode = document.createElement("div");
      nameNode.className = "seat-name";
      nameNode.textContent = playerDisplayName(playerIndex);

      if (isFinished(playerIndex)) {
        const rankNode = document.createElement("div");
        rankNode.className = "seat-rank";
        rankNode.textContent = `#${finishedRanks.get(playerIndex)}`;
        seat.append(nameNode, rankNode);
      } else {
        const stackNode = createStack(game.hands[playerIndex].length);
        seat.append(nameNode, stackNode);
      }

      seatsLayerNode.append(seat);
    }
  }

  function canStackOnCard(card, baseCard, hand) {
    if (!baseCard) {
      return game.isPlayableSingle(card, hand);
    }
    return game.isPlayableSingle(card, hand);
  }

  function isValidComboSequence(cardIds) {
    if (cardIds.length === 0) {
      return false;
    }

    const hand = game.handOf(HUMAN_INDEX);
    const firstCard = hand.find((c) => c.id === cardIds[0]);

    if (!firstCard) {
      return false;
    }

    if (!game.isPlayableSingle(firstCard, hand)) {
      return false;
    }

    const firstGroupKey = cardGroupKey(firstCard);

    for (const cardId of cardIds) {
      const card = hand.find((c) => c.id === cardId);
      if (!card) {
        return false;
      }
      if (cardGroupKey(card) !== firstGroupKey) {
        return false;
      }
    }

    return true;
  }

  function renderHand() {
    playerHandNode.textContent = "";
    playerHandNode.classList.remove("multi-row");
    const hand = game.handOf(HUMAN_INDEX).filter((card) => !hiddenHumanCardIds.has(card.id));
    hand.forEach((card, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `player-card ${cardColorClass(card)}`;
      button.setAttribute("aria-label", `${cardLabel(card)} ${card.color || "wild"}`);
      button.dataset.cardId = card.id;

      button.append(createCardImage(card, cardLabel(card)));

      const isSelected = selectedCardIds.has(card.id);
      button.style.setProperty("--tilt", "0deg");
      button.style.setProperty("--lift", isSelected ? "-32px" : "0px");
      button.style.zIndex = String(100 + index + (isSelected ? 1000 : 0));

      const playable = canPlayCard(card, HUMAN_INDEX);
      const canAddToCombo = selectedCardIds.size > 0 && isValidComboSequence([...Array.from(selectedCardIds), card.id]);
      const isPlayableAsCombo = playable || canAddToCombo;

      button.classList.toggle("playable", playable);
      button.classList.toggle("selected", isSelected);
      button.classList.remove("disabled");

      button.addEventListener("click", (event) => {
        if (isAnimating) {
          return;
        }

        if (event.shiftKey) {
          event.preventDefault();
          if (isSelected) {
            selectedCardIds.delete(card.id);
          } else if (isPlayableAsCombo) {
            selectedCardIds.add(card.id);
          }
          render();
        } else {
          if (!playable && selectedCardIds.size === 0) {
            return;
          }

          if (selectedCardIds.size > 0) {
            if (isValidComboSequence([...Array.from(selectedCardIds), card.id])) {
              void performHumanPlayCombo([...Array.from(selectedCardIds), card.id]);
            } else if (isValidComboSequence(Array.from(selectedCardIds))) {
              void performHumanPlayCombo(Array.from(selectedCardIds));
            }
            selectedCardIds.clear();
          } else if (playable) {
            void performHumanPlay(card, button);
          }
        }
      });

      playerHandNode.append(button);
    });

    const rowOffsets = new Set();
    for (const cardNode of playerHandNode.children) {
      rowOffsets.add(cardNode.offsetTop);
    }
    playerHandNode.classList.toggle("multi-row", rowOffsets.size > 1);
  }

  function updateTurnHighlights() {
    playerLabelNode.classList.toggle("active", game.currentPlayer === HUMAN_INDEX);

    seatsLayerNode.querySelectorAll(".seat").forEach((seat) => {
      seat.classList.toggle("current", Number(seat.dataset.playerIndex) === game.currentPlayer);
    });
  }

  function renderDirectionIndicator() {
    directionIndicatorNode.classList.toggle("clockwise", game.direction === 1);
    directionIndicatorNode.classList.toggle("counterclockwise", game.direction === -1);
  }

  function render() {
    if (!game) {
      return;
    }
    renderCenterPiles();
    renderSeats();
    renderDirectionIndicator();
    renderHand();
    updateTurnHighlights();
  }

  function makeGhostCard(card, role, faceMode) {
    const ghost = document.createElement("div");
    ghost.className = `ghost-card ${cardColorClass(card)}`;
    if (faceMode === "back") {
      ghost.textContent = "";
    } else {
      ghost.append(createCardImage(card, cardLabel(card)));
    }
    if (faceMode === "back") {
      ghost.style.background = "linear-gradient(180deg, #b8afa6, #9b9188)";
      ghost.style.color = "transparent";
    }

    if (faceMode === "back") {
      ghost.style.borderColor = "var(--ink)";
      ghost.style.outlineColor = "var(--card-white)";
      ghost.style.outlineOffset = "-9px";
    }

    ghost.style.left = "0px";
    ghost.style.top = "0px";
    ghost.style.width = "0px";
    ghost.style.height = "0px";

    if (role === "agent") {
      ghost.classList.add(faceMode === "back" ? "play-agent" : "play-agent");
    } else {
      ghost.classList.add(faceMode === "back" ? "play-human" : "play-human");
    }

    return ghost;
  }

  function clearWildChoiceLayer() {
    wildChoiceLayerNode.replaceChildren();
    wildChoiceLayerNode.classList.remove("visible");
  }

  function renderWildChoiceButtons(autoColor) {
    clearWildChoiceLayer();
    const colors = COLORS.slice();
    const buttons = new Map();

    for (const color of colors) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `wild-color-option ${color}`;
      button.setAttribute("aria-label", `Choose ${color}`);
      button.dataset.color = color;
      wildChoiceLayerNode.append(button);
      buttons.set(color, button);
    }

    wildChoiceLayerNode.classList.add("visible");

    return { buttons, autoColor };
  }

  function animateChipToTop(color, originRect) {
    const targetRect = topCardRect();
    const chip = document.createElement("div");
    chip.className = `wild-color-chip ${color}`;

    const from = stageRectFrom(originRect);
    const to = stageRectFrom(targetRect);

    chip.style.left = `${from.left + from.width / 2 - 11}px`;
    chip.style.top = `${from.top + from.height / 2 - 11}px`;
    animLayerNode.append(chip);

    return new Promise((resolve) => {
      const finish = () => {
        chip.remove();
        resolve();
      };

      chip.addEventListener("transitionend", finish, { once: true });

      requestAnimationFrame(() => {
        chip.style.left = `${to.left + to.width / 2 - 11}px`;
        chip.style.top = `${to.top + to.height / 2 - 11}px`;
        chip.style.transform = "scale(1.25)";
        window.setTimeout(finish, 600);
      });
    });
  }

  function chooseWildColor({ autoColor, originRect }) {
    const { buttons } = renderWildChoiceButtons(autoColor);

    return new Promise((resolve) => {
      let settled = false;

      const finish = async (color, button) => {
        if (settled) {
          return;
        }
        settled = true;
        const buttonRect = button.getBoundingClientRect();
        clearWildChoiceLayer();
        resolve({ color, originRect: buttonRect || originRect });
      };

      for (const [color, button] of buttons.entries()) {
        button.addEventListener("click", () => {
          void finish(color, button);
        }, { once: true });
      }

      if (autoColor) {
        const autoButton = buttons.get(autoColor);
        window.setTimeout(() => {
          if (autoButton) {
            void finish(autoColor, autoButton);
          }
        }, 350);
      }
    });
  }

  function animateGhost(ghost, fromRect, toRect, startTransform, endTransform) {
    const from = stageRectFrom(fromRect);
    const to = stageRectFrom(toRect);

    ghost.style.left = `${from.left}px`;
    ghost.style.top = `${from.top}px`;
    ghost.style.width = `${from.width}px`;
    ghost.style.height = `${from.height}px`;
    ghost.style.transform = startTransform;
    animLayerNode.append(ghost);

    return new Promise((resolve) => {
      const finish = () => {
        ghost.remove();
        resolve();
      };

      ghost.addEventListener("transitionend", finish, { once: true });

      requestAnimationFrame(() => {
        ghost.style.left = `${to.left}px`;
        ghost.style.top = `${to.top}px`;
        ghost.style.width = `${to.width}px`;
        ghost.style.height = `${to.height}px`;
        ghost.style.transform = endTransform;
        window.setTimeout(finish, 650);
      });
    });
  }

  async function animatePlayCards(playerIndex, cards, sourceRect, chooseColor, chipOriginRect) {
    if (!Array.isArray(cards) || cards.length === 0) {
      return;
    }

    const leadCard = cards[0];
    const role = playerIndex === HUMAN_INDEX ? "human" : "agent";
    const safeSourceRect = isUsableRect(sourceRect)
      ? sourceRect
      : (playerIndex === HUMAN_INDEX ? playerHandNode.getBoundingClientRect() : getAgentPlaySourceRect(playerIndex));
    const startTransform = role === "agent" ? "rotateY(180deg) rotate(10deg) scale(1)" : "rotate(8deg) scale(1)";
    const endTransform = role === "agent" ? "rotateY(0deg) rotate(0deg) scale(1)" : "rotate(0deg) scale(1)";

    for (let index = 0; index < cards.length; index += 1) {
      const ghost = makeGhostCard(cards[index], role, "face");
      const targetRect = topCardRect();
      const fromRect = {
        left: safeSourceRect.left + Math.min(index * 3, 12),
        top: safeSourceRect.top + Math.min(index * 2, 8),
        width: safeSourceRect.width,
        height: safeSourceRect.height,
      };

      await animateGhost(ghost, fromRect, targetRect, startTransform, endTransform);
      if (index < cards.length - 1) {
        await sleep(70);
      }
    }

    game.playCards(playerIndex, cards.map((card) => card.id), chooseColor);
    activeWildColor = (leadCard.type === CARD_TYPES.WILD || leadCard.type === CARD_TYPES.WILD_DRAW_FOUR) ? chooseColor : null;
    ensureCurrentActivePlayer();
    render();

    if (activeWildColor) {
      await animateChipToTop(activeWildColor, chipOriginRect || safeSourceRect);
      render();
    }
  }

  async function animatePlay(playerIndex, card, sourceRect, chooseColor, chipOriginRect) {
    await animatePlayCards(playerIndex, [card], sourceRect, chooseColor, chipOriginRect);
  }

  async function animateDraw(playerIndex, drawCount) {
    const role = playerIndex === HUMAN_INDEX ? "human" : "agent";
    const penaltyActive = game.pendingDraw > 0;

    render();
    await nextFrame();

    for (let index = 0; index < drawCount; index += 1) {
      const sourceRect = drawPileRect();
      const targetAnchor = getDrawTargetAnchor(playerIndex);
      const targetRect = {
        left: targetAnchor.left + (targetAnchor.width * 0.5) - (sourceRect.width * 0.5) + Math.min(index * 4, 24),
        top: targetAnchor.top + (targetAnchor.height * 0.5) - (sourceRect.height * 0.5) + Math.min(index * 2, 12),
        width: sourceRect.width,
        height: sourceRect.height,
      };
      const ghost = makeGhostCard({ type: CARD_TYPES.WILD_DRAW_FOUR }, role, "back");
      const startTransform = "rotate(0deg) scale(1)";
      const endTransform = "rotate(0deg) scale(1)";
      await animateGhost(ghost, sourceRect, targetRect, startTransform, endTransform);

      game.drawCards(playerIndex, 1);
      render();
      await nextFrame();
    }

    if (penaltyActive) {
      game.pendingDraw = 0;
      game.pendingDrawType = null;
      render();
    }
  }

  function getPlayableCardsForPlayer(playerIndex) {
    if (!game || game.currentPlayer !== playerIndex || isFinished(playerIndex)) {
      return [];
    }

    const hand = game.handOf(playerIndex);

    if (game.pendingSkips > 0) {
      return hand.filter((card) => card.type === CARD_TYPES.BLOCK);
    }

    if (game.pendingDraw > 0) {
      return hand.filter((card) => cardGroupKey(card) === game.pendingDrawType);
    }

    return hand.filter((card) => game.isPlayableSingle(card, hand));
  }

  function beginHumanPostDrawWindow(drawCount) {
    clearHumanPostDrawTimer();

    const waitMs = Math.max(1, drawCount) * 2000;
    humanPostDrawTimer = window.setTimeout(() => {
      humanPostDrawTimer = null;

      if (!game || isAnimating || game.currentPlayer !== HUMAN_INDEX) {
        return;
      }

      game.advanceTurn();
      ensureCurrentActivePlayer();
      render();
      scheduleNextAgentTurn();
    }, waitMs);
  }

  function humanCanRespondToBlock() {
    if (!game || game.currentPlayer !== HUMAN_INDEX || game.pendingSkips <= 0) {
      return false;
    }

    const hand = game.handOf(HUMAN_INDEX);
    return hand.some((card) => card.type === CARD_TYPES.BLOCK);
  }

  function scheduleHumanBlockedSkipIfNeeded() {
    clearHumanBlockedSkipTimer();

    if (!game || isAnimating || game.currentPlayer !== HUMAN_INDEX || game.pendingSkips <= 0 || humanCanRespondToBlock()) {
      return;
    }

    humanBlockedSkipTimer = window.setTimeout(() => {
      humanBlockedSkipTimer = null;

      if (!game || isAnimating || game.currentPlayer !== HUMAN_INDEX || game.pendingSkips <= 0 || humanCanRespondToBlock()) {
        return;
      }

      try {
        game.passTurn(HUMAN_INDEX);
        ensureCurrentActivePlayer();
        clearStatus();
      } catch (error) {
        setStatus(error.message, true);
      }

      render();
      scheduleNextAgentTurn();
    }, 850);
  }

  function humanPlayableCardElement(cardId) {
    return [...playerHandNode.querySelectorAll(".player-card")].find((element) => element.textContent === cardLabel(game.handOf(HUMAN_INDEX).find((card) => card.id === cardId)));
  }

  async function performHumanPlay(card, button) {
    isAnimating = true;
    clearAgentTimer();
    clearHumanPostDrawTimer();
    clearHumanBlockedSkipTimer();

    try {
      const sourceRect = button.getBoundingClientRect();
      let chooseColor = null;
      let chipOriginRect = sourceRect;
      hiddenHumanCardIds.add(card.id);
      render();
      if (card.type === CARD_TYPES.WILD || card.type === CARD_TYPES.WILD_DRAW_FOUR) {
        const selection = await chooseWildColor({ autoColor: null, originRect: sourceRect });
        chooseColor = selection.color;
        chipOriginRect = selection.originRect;
      }
      await animatePlay(HUMAN_INDEX, card, sourceRect, chooseColor, chipOriginRect);
      hiddenHumanCardIds.delete(card.id);
      const restarted = await resolveWinners();
      if (restarted) {
        return;
      }
      clearStatus();
    } catch (error) {
      hiddenHumanCardIds.delete(card.id);
      setStatus(error.message, true);
    } finally {
      isAnimating = false;
      selectedCardIds.clear();
      render();
      scheduleNextAgentTurn();
    }
  }

  async function performHumanPlayCombo(cardIds) {
    isAnimating = true;
    clearAgentTimer();
    clearHumanPostDrawTimer();
    clearHumanBlockedSkipTimer();

    try {
      let chooseColor = null;
      let chipOriginRect = null;
      const hand = game.handOf(HUMAN_INDEX);
      const card = hand.find((c) => c.id === cardIds[0]);

      for (const cardId of cardIds) {
        hiddenHumanCardIds.add(cardId);
      }
      render();

      const button = playerHandNode.querySelector(`[data-card-id="${cardIds[0]}"]`);
      const sourceRect = button ? button.getBoundingClientRect() : playerHandNode.getBoundingClientRect();

      if (card.type === CARD_TYPES.WILD || card.type === CARD_TYPES.WILD_DRAW_FOUR) {
        const selection = await chooseWildColor({ autoColor: null, originRect: sourceRect });
        chooseColor = selection.color;
        chipOriginRect = selection.originRect;
      }

      const ghost = makeGhostCard(card, "human", "face");
      const targetRect = topCardRect();
      const startTransform = "rotate(8deg) scale(1)";
      const endTransform = "rotate(0deg) scale(1)";

      await animateGhost(ghost, sourceRect, targetRect, startTransform, endTransform);

      for (const cardId of cardIds) {
        hiddenHumanCardIds.delete(cardId);
      }

      game.playCards(HUMAN_INDEX, cardIds, chooseColor);
      activeWildColor = (card.type === CARD_TYPES.WILD || card.type === CARD_TYPES.WILD_DRAW_FOUR) ? chooseColor : null;
      ensureCurrentActivePlayer();
      render();

      if (activeWildColor) {
        await animateChipToTop(activeWildColor, chipOriginRect || sourceRect);
        render();
      }

      const restarted = await resolveWinners();
      if (restarted) {
        return;
      }
      clearStatus();
    } catch (error) {
      for (const cardId of cardIds) {
        hiddenHumanCardIds.delete(cardId);
      }
      setStatus(error.message, true);
    } finally {
      isAnimating = false;
      selectedCardIds.clear();
      render();
      scheduleNextAgentTurn();
    }
  }

  async function performHumanDraw() {
    if (!game || isAnimating || game.currentPlayer !== HUMAN_INDEX) {
      return;
    }

    isAnimating = true;
    clearAgentTimer();
    clearHumanPostDrawTimer();
    clearHumanBlockedSkipTimer();

    try {
      const drawCount = game.pendingDraw > 0 ? game.pendingDraw : 1;
      await animateDraw(HUMAN_INDEX, drawCount);

      const playableAfterDraw = getPlayableCardsForPlayer(HUMAN_INDEX);
      if (playableAfterDraw.length > 0) {
        beginHumanPostDrawWindow(drawCount);
      } else {
        game.advanceTurn();
        ensureCurrentActivePlayer();
      }

      const restarted = await resolveWinners();
      if (restarted) {
        return;
      }
      clearStatus();
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      isAnimating = false;
      render();
      scheduleNextAgentTurn();
    }
  }

  function chooseAgentAction(playerIndex) {
    const hand = game.handOf(playerIndex);

    function comboFromFirst(firstCard) {
      if (firstCard.type === CARD_TYPES.REVERSE) {
        return [firstCard];
      }

      const key = [firstCard.type, firstCard.color || "", firstCard.value ?? ""].join("|");
      const combo = [firstCard];

      for (const card of hand) {
        const cardKey = [card.type, card.color || "", card.value ?? ""].join("|");
        if (card.id !== firstCard.id && cardKey === key) {
          combo.push(card);
        }
      }

      return combo;
    }

    if (game.pendingSkips > 0) {
      const blocks = hand.filter((card) => card.type === CARD_TYPES.BLOCK);
      if (blocks.length > 0) {
        return { type: "play", cards: comboFromFirst(blocks[0]), chooseColor: null };
      }
      return { type: "pass" };
    }

    if (game.pendingDraw > 0) {
      const stackCards = hand.filter((card) => cardGroupKey(card) === game.pendingDrawType);
      if (stackCards.length > 0) {
        const firstCard = stackCards[0];
        return {
          type: "play",
          cards: comboFromFirst(firstCard),
          chooseColor: firstCard.type === CARD_TYPES.WILD_DRAW_FOUR ? chooseAgentColor(hand) : null,
        };
      }
      return { type: "draw", drawCount: game.pendingDraw };
    }

    const playableCards = hand.filter((card) => game.isPlayableSingle(card, hand));
    if (playableCards.length > 0) {
      const firstCard = playableCards[0];
      return {
        type: "play",
        cards: comboFromFirst(firstCard),
        chooseColor: firstCard.type === CARD_TYPES.WILD || firstCard.type === CARD_TYPES.WILD_DRAW_FOUR ? chooseAgentColor(hand) : null,
      };
    }

    return { type: "draw", drawCount: 1 };
  }

  function chooseAgentPostDrawPlay(playerIndex) {
    const hand = game.handOf(playerIndex);
    const playableCards = getPlayableCardsForPlayer(playerIndex);

    function comboFromFirst(firstCard) {
      if (firstCard.type === CARD_TYPES.REVERSE) {
        return [firstCard];
      }

      const key = [firstCard.type, firstCard.color || "", firstCard.value ?? ""].join("|");
      const combo = [firstCard];

      for (const card of hand) {
        const cardKey = [card.type, card.color || "", card.value ?? ""].join("|");
        if (card.id !== firstCard.id && cardKey === key) {
          combo.push(card);
        }
      }

      return combo;
    }

    if (playableCards.length === 0) {
      return null;
    }

    const firstCard = playableCards[0];
    return {
      cards: comboFromFirst(firstCard),
      chooseColor: firstCard.type === CARD_TYPES.WILD || firstCard.type === CARD_TYPES.WILD_DRAW_FOUR ? chooseAgentColor(hand) : null,
    };
  }

  async function runAgentTurns() {
    if (isAnimating || !game) {
      return;
    }

    ensureCurrentActivePlayer();
    if (game.currentPlayer === HUMAN_INDEX) {
      return;
    }

    clearAgentTimer();
    isAnimating = true;

    try {
      while (game.currentPlayer !== HUMAN_INDEX) {
        ensureCurrentActivePlayer();
        if (game.currentPlayer === HUMAN_INDEX) {
          break;
        }

        const playerIndex = game.currentPlayer;
        if (agentThinkDelayMs > 0) {
          await sleep(agentThinkDelayMs);
        }
        const action = chooseAgentAction(playerIndex);

        if (action.type === "play") {
          render();
          await nextFrame();
          const sourceRect = getAgentPlaySourceRect(playerIndex);
          await animatePlayCards(playerIndex, action.cards, sourceRect, action.chooseColor, sourceRect);
        } else if (action.type === "draw") {
          await animateDraw(playerIndex, action.drawCount);

          const postDrawPlay = chooseAgentPostDrawPlay(playerIndex);
          if (postDrawPlay) {
            if (!game || game.currentPlayer !== playerIndex || isFinished(playerIndex)) {
              break;
            }

            render();
            await nextFrame();
            const sourceRect = getAgentPlaySourceRect(playerIndex);
            await animatePlayCards(playerIndex, postDrawPlay.cards, sourceRect, postDrawPlay.chooseColor, sourceRect);
          } else {
            game.advanceTurn();
            ensureCurrentActivePlayer();
            render();
          }
        } else {
          game.passTurn(playerIndex);
          ensureCurrentActivePlayer();
          render();
        }

        const restarted = await resolveWinners();
        if (restarted) {
          return;
        }

      }
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      isAnimating = false;
      render();
      scheduleNextAgentTurn();
    }
  }

  function scheduleNextAgentTurn() {
    clearAgentTimer();
    clearHumanBlockedSkipTimer();

    if (game) {
      ensureCurrentActivePlayer();
    }

    scheduleHumanBlockedSkipIfNeeded();

    if (!game || game.currentPlayer === HUMAN_INDEX || isAnimating) {
      return;
    }

    agentTimer = window.setTimeout(() => {
      void runAgentTurns();
    }, 320);
  }

  function renderErrorState(message) {
    setStatus(message, true);
  }

  function startNewGame(playerCount, customAgentNames = []) {
    pendingPlayerCount = normalizedPlayerCount(playerCount);
    clearAgentTimer();
    clearHumanPostDrawTimer();
    clearHumanBlockedSkipTimer();
    isAnimating = false;
    hiddenHumanCardIds = new Set();
    selectedCardIds = new Set();
    activeWildColor = null;
    finishedRanks = new Map();
    agentNames = new Map();
    winnerBannerNode.classList.remove("visible");
    winnerBannerNode.textContent = "";
    clearWildChoiceLayer();
    game = UnoGame.create({ playerCount: pendingPlayerCount, handSize: 7, seed: Date.now() });
    assignAgentNames(customAgentNames);
    game.currentPlayer = HUMAN_INDEX;
    render();
    scheduleNextAgentTurn();
  }

  drawPileButton.addEventListener("click", () => {
    void performHumanDraw();
  });

  newGameButton.addEventListener("click", () => {
    openNewGameModal();
  });

  rulesButton.addEventListener("click", () => {
    openRulesModal();
  });

  rulesCloseButton.addEventListener("click", () => {
    closeRulesModal();
  });

  rulesModalNode.addEventListener("click", (event) => {
    if (event.target === rulesModalNode) {
      closeRulesModal();
    }
  });

  newGameCancelButton.addEventListener("click", () => {
    closeNewGameModal();
  });

  newGameFormNode.addEventListener("submit", (event) => {
    event.preventDefault();
    agentThinkDelayMs = speedDelayFromLabel(speedSelectNode.value);
    startNewGame(playerCountSelectNode.value, parseAgentNames(agentNamesInputNode.value));
    closeNewGameModal();
  });

  newGameModalNode.addEventListener("click", (event) => {
    if (event.target === newGameModalNode && game) {
      closeNewGameModal();
    }
  });
  window.addEventListener("resize", render);
  window.addEventListener("keyup", (event) => {
    if (event.key === "Shift" && selectedCardIds.size > 0 && isValidComboSequence(Array.from(selectedCardIds))) {
      void performHumanPlayCombo(Array.from(selectedCardIds));
      selectedCardIds.clear();
    }
  });

  startNewGame(AGENT_PLAYERS + 1);
})();