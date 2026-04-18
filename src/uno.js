const COLORS = ["red", "yellow", "green", "blue"];

const CARD_TYPES = {
  NUMBER: "number",
  DRAW_TWO: "draw2",
  BLOCK: "block",
  REVERSE: "reverse",
  WILD: "wild",
  WILD_DRAW_FOUR: "wildDraw4",
};

const AGENT_PLAYERS = 3;

function mulberry32(seed) {
  let value = seed >>> 0;

  return function nextRandom() {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(cards, seed = 1) {
  const random = mulberry32(seed);
  const result = cards.slice();

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

function createCard(card, id) {
  return { id, ...card };
}

function createStandardDeck() {
  const deck = [];
  let id = 0;

  for (const color of COLORS) {
    deck.push(createCard({ type: CARD_TYPES.NUMBER, color, value: 0 }, id += 1));

    for (let value = 1; value <= 9; value += 1) {
      deck.push(createCard({ type: CARD_TYPES.NUMBER, color, value }, id += 1));
      deck.push(createCard({ type: CARD_TYPES.NUMBER, color, value }, id += 1));
    }

    for (let count = 0; count < 2; count += 1) {
      deck.push(createCard({ type: CARD_TYPES.DRAW_TWO, color }, id += 1));
      deck.push(createCard({ type: CARD_TYPES.BLOCK, color }, id += 1));
      deck.push(createCard({ type: CARD_TYPES.REVERSE, color }, id += 1));
    }
  }

  for (let count = 0; count < 4; count += 1) {
    deck.push(createCard({ type: CARD_TYPES.WILD }, id += 1));
    deck.push(createCard({ type: CARD_TYPES.WILD_DRAW_FOUR }, id += 1));
  }

  return deck;
}

function cloneCard(card) {
  return { ...card };
}

function cloneHand(hand) {
  return hand.map(cloneCard);
}

function cardGroupKey(card) {
  if (card.type === CARD_TYPES.NUMBER) {
    return `${card.type}:${card.value}`;
  }

  return card.type;
}

function cardDisplayValue(card) {
  if (card.type === CARD_TYPES.NUMBER) {
    return String(card.value);
  }

  return card.type;
}

function isWild(card) {
  return card.type === CARD_TYPES.WILD || card.type === CARD_TYPES.WILD_DRAW_FOUR;
}

function topCardColor(card, currentColor) {
  return isWild(card) ? currentColor : card.color;
}

function handHasMatchingColor(hand, currentColor) {
  return hand.some((card) => card.color === currentColor);
}

function sameCombo(cards) {
  const firstKey = cardGroupKey(cards[0]);
  return cards.every((card) => cardGroupKey(card) === firstKey);
}

class UnoGame {
  constructor({
    playerCount = AGENT_PLAYERS + 1,
    seed = 1,
    deck,
    discardPile,
    hands,
    currentPlayer = 0,
    direction = 1,
    currentColor,
    pendingDraw = 0,
    pendingDrawType = null,
    pendingSkips = 0,
  } = {}) {
    this.playerCount = playerCount;
    this.seed = seed;
    this.deck = deck ? deck.map(cloneCard) : shuffle(createStandardDeck(), seed);
    this.discardPile = discardPile ? discardPile.map(cloneCard) : [];
    this.hands = hands ? hands.map(cloneHand) : Array.from({ length: playerCount }, () => []);
    this.currentPlayer = currentPlayer;
    this.direction = direction;
    this.currentColor = currentColor ?? null;
    this.pendingDraw = pendingDraw;
    this.pendingDrawType = pendingDrawType;
    this.pendingSkips = pendingSkips;

    if (this.discardPile.length > 0 && this.currentColor === null) {
      this.currentColor = topCardColor(this.discardPile[this.discardPile.length - 1], this.currentColor);
    }
  }

  static create({ playerCount = AGENT_PLAYERS + 1, seed = 1, handSize = 7 } = {}) {
    const deck = shuffle(createStandardDeck(), seed);
    const hands = Array.from({ length: playerCount }, () => []);

    for (let round = 0; round < handSize; round += 1) {
      for (let player = 0; player < playerCount; player += 1) {
        hands[player].push(deck.pop());
      }
    }

    let starter = deck.pop();
    while (starter && isWild(starter)) {
      deck.unshift(starter);
      starter = deck.pop();
    }

    const discardPile = starter ? [starter] : [];
    const currentColor = starter ? topCardColor(starter, starter.color) : null;

    return new UnoGame({
      playerCount,
      seed,
      deck,
      discardPile,
      hands,
      currentColor,
    });
  }

  clone() {
    return new UnoGame({
      playerCount: this.playerCount,
      seed: this.seed,
      deck: this.deck,
      discardPile: this.discardPile,
      hands: this.hands,
      currentPlayer: this.currentPlayer,
      direction: this.direction,
      currentColor: this.currentColor,
      pendingDraw: this.pendingDraw,
      pendingDrawType: this.pendingDrawType,
      pendingSkips: this.pendingSkips,
    });
  }

  snapshot() {
    return {
      playerCount: this.playerCount,
      currentPlayer: this.currentPlayer,
      direction: this.direction,
      currentColor: this.currentColor,
      pendingDraw: this.pendingDraw,
      pendingDrawType: this.pendingDrawType,
      pendingSkips: this.pendingSkips,
      deckSize: this.deck.length,
      discardTop: this.discardPile[this.discardPile.length - 1] ? cloneCard(this.discardPile[this.discardPile.length - 1]) : null,
      hands: this.hands.map((hand) => hand.map(cloneCard)),
    };
  }

  handOf(playerIndex) {
    this.assertPlayer(playerIndex);
    return this.hands[playerIndex];
  }

  assertPlayer(playerIndex) {
    if (playerIndex < 0 || playerIndex >= this.playerCount) {
      throw new RangeError(`Invalid player index: ${playerIndex}`);
    }
  }

  assertCurrentPlayer(playerIndex) {
    this.assertPlayer(playerIndex);
    if (playerIndex !== this.currentPlayer) {
      throw new Error(`It is player ${this.currentPlayer}'s turn, not player ${playerIndex}'s turn.`);
    }
  }

  nextPlayerIndex(fromIndex = this.currentPlayer) {
    return (fromIndex + this.direction + this.playerCount) % this.playerCount;
  }

  advanceTurn() {
    this.currentPlayer = this.nextPlayerIndex(this.currentPlayer);
  }

  refillDeckIfNeeded() {
    if (this.deck.length > 0) {
      return;
    }

    if (this.discardPile.length <= 1) {
      throw new Error("No cards left to draw.");
    }

    const top = this.discardPile.pop();
    this.deck = shuffle(this.discardPile, this.seed + this.discardPile.length + 1);
    this.discardPile = [top];
  }

  drawCard(playerIndex) {
    this.assertPlayer(playerIndex);
    this.refillDeckIfNeeded();
    const card = this.deck.pop();
    this.hands[playerIndex].push(card);
    return cloneCard(card);
  }

  drawCards(playerIndex, count) {
    const drawn = [];
    for (let index = 0; index < count; index += 1) {
      drawn.push(this.drawCard(playerIndex));
    }
    return drawn;
  }

  removeCardsFromHand(playerIndex, cardIds) {
    const hand = this.handOf(playerIndex);
    const updatedHand = hand.slice();
    const cards = [];

    for (const id of cardIds) {
      const position = updatedHand.findIndex((card) => card.id === id);
      if (position === -1) {
        throw new Error(`Player ${playerIndex} does not have card ${id}.`);
      }
      cards.push(updatedHand[position]);
      updatedHand.splice(position, 1);
    }

    this.hands[playerIndex] = updatedHand;

    return cards;
  }

  isPlayableSingle(card, hand) {
    const topCard = this.discardPile[this.discardPile.length - 1];
    const currentColor = this.currentColor;

    if (!topCard) {
      return true;
    }

    if (card.type === CARD_TYPES.WILD) {
      return true;
    }

    if (card.type === CARD_TYPES.WILD_DRAW_FOUR) {
      return true;
    }

    if (topCard.type === CARD_TYPES.WILD || topCard.type === CARD_TYPES.WILD_DRAW_FOUR) {
      return card.color === currentColor;
    }

    if (card.color === currentColor) {
      return true;
    }

    if (card.type === topCard.type && card.type !== CARD_TYPES.NUMBER) {
      return true;
    }

    return card.type === CARD_TYPES.NUMBER && topCard.type === CARD_TYPES.NUMBER && card.value === topCard.value;
  }

  validateCombo(playerIndex, cardIds, chooseColor) {
    this.assertCurrentPlayer(playerIndex);

    if (!Array.isArray(cardIds) || cardIds.length === 0) {
      throw new Error("A play must include at least one card.");
    }

    const originalHand = cloneHand(this.handOf(playerIndex));

    try {
      const hand = this.handOf(playerIndex);
      const cards = this.removeCardsFromHand(playerIndex, cardIds);

      if (!sameCombo(cards)) {
        throw new Error("All cards in a combo must have the same rank or card type.");
      }

      const groupKey = cardGroupKey(cards[0]);

      if (this.pendingDraw > 0) {
        if (groupKey !== this.pendingDrawType) {
          throw new Error(`Player must stack ${this.pendingDrawType} cards or draw ${this.pendingDraw}.`);
        }
      }

      if (this.pendingSkips > 0 && groupKey !== CARD_TYPES.BLOCK) {
        throw new Error("A blocked player can only respond with block cards or pass.");
      }

      if ((groupKey === CARD_TYPES.WILD || groupKey === CARD_TYPES.WILD_DRAW_FOUR) && (!chooseColor || !COLORS.includes(chooseColor))) {
        throw new Error(`A valid chooseColor is required for ${groupKey} cards.`);
      }

      if (this.pendingDraw === 0 && this.pendingSkips === 0 && !this.isPlayableSingle(cards[0], hand)) {
        throw new Error(`Card ${cardDisplayValue(cards[0])} is not playable right now.`);
      }

      return { cards, groupKey };
    } catch (error) {
      this.hands[playerIndex] = originalHand;
      throw error;
    }
  }

  playCards(playerIndex, cardIds, chooseColor) {
    const { cards, groupKey } = this.validateCombo(playerIndex, cardIds, chooseColor);
    const comboSize = cards.length;

    this.discardPile.push(...cards);

    if (groupKey === CARD_TYPES.NUMBER) {
      this.currentColor = cards[cards.length - 1].color;
    } else if (groupKey === CARD_TYPES.WILD || groupKey === CARD_TYPES.WILD_DRAW_FOUR) {
      this.currentColor = chooseColor;
    } else {
      this.currentColor = cards[cards.length - 1].color;
    }

    if (this.pendingDraw > 0 && groupKey === this.pendingDrawType) {
      const drawAmount = groupKey === CARD_TYPES.DRAW_TWO ? 2 * comboSize : 4 * comboSize;
      this.pendingDraw += drawAmount;
    } else if (groupKey === CARD_TYPES.DRAW_TWO) {
      this.pendingDraw = 2 * comboSize;
      this.pendingDrawType = CARD_TYPES.DRAW_TWO;
    } else if (groupKey === CARD_TYPES.WILD_DRAW_FOUR) {
      this.pendingDraw = 4 * comboSize;
      this.pendingDrawType = CARD_TYPES.WILD_DRAW_FOUR;
    } else {
      this.pendingDraw = 0;
      this.pendingDrawType = null;
    }

    if (groupKey === CARD_TYPES.BLOCK) {
      this.pendingSkips += this.pendingSkips > 0 ? comboSize - 1 : comboSize;
    }

    if (groupKey === CARD_TYPES.REVERSE && comboSize % 2 === 1) {
      this.direction *= -1;
    }

    this.advanceTurn();
    return this.snapshot();
  }

  drawThenPlay(playerIndex, chooseColor, cardIds = []) {
    this.assertCurrentPlayer(playerIndex);

    const originalState = {
      currentPlayer: this.currentPlayer,
      direction: this.direction,
      currentColor: this.currentColor,
      pendingDraw: this.pendingDraw,
      pendingDrawType: this.pendingDrawType,
      pendingSkips: this.pendingSkips,
      deck: this.deck.map(cloneCard),
      discardPile: this.discardPile.map(cloneCard),
      hands: this.hands.map(cloneHand),
    };

    const count = this.pendingDraw > 0 ? this.pendingDraw : 1;
    try {
      this.drawCards(playerIndex, count);
      this.pendingDraw = 0;
      this.pendingDrawType = null;

      if (cardIds.length === 0) {
        this.advanceTurn();
        return this.snapshot();
      }

      return this.playCards(playerIndex, cardIds, chooseColor);
    } catch (error) {
      this.currentPlayer = originalState.currentPlayer;
      this.direction = originalState.direction;
      this.currentColor = originalState.currentColor;
      this.pendingDraw = originalState.pendingDraw;
      this.pendingDrawType = originalState.pendingDrawType;
      this.pendingSkips = originalState.pendingSkips;
      this.deck = originalState.deck.map(cloneCard);
      this.discardPile = originalState.discardPile.map(cloneCard);
      this.hands = originalState.hands.map(cloneHand);
      throw error;
    }
  }

  passTurn(playerIndex) {
    this.assertCurrentPlayer(playerIndex);

    if (this.pendingSkips > 0) {
      this.pendingSkips -= 1;
      this.advanceTurn();
      return this.snapshot();
    }

    if (this.pendingDraw > 0) {
      throw new Error("A player facing a draw stack must draw or stack a matching draw card.");
    }

    this.drawCards(playerIndex, 1);
    this.advanceTurn();
    return this.snapshot();
  }
}

const UNO_EXPORTS = {
  AGENT_PLAYERS,
  CARD_TYPES,
  COLORS,
  UnoGame,
  createStandardDeck,
  shuffle,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = UNO_EXPORTS;
}

if (typeof window !== "undefined") {
  window.UnoCore = UNO_EXPORTS;
}