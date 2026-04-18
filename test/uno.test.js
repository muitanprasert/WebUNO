const assert = require("node:assert/strict");
const test = require("node:test");

const { CARD_TYPES, UnoGame } = require("../src/uno");

function card(id, type, color, value) {
  const result = { id, type };
  if (color) {
    result.color = color;
  }
  if (value !== undefined) {
    result.value = value;
  }
  return result;
}

function makeGame({ hands, discardPile, currentColor, currentPlayer = 0, direction = 1, pendingDraw = 0, pendingDrawType = null, pendingSkips = 0, deck = [] }) {
  return new UnoGame({
    playerCount: 4,
    hands,
    discardPile,
    currentColor,
    currentPlayer,
    direction,
    pendingDraw,
    pendingDrawType,
    pendingSkips,
    deck,
  });
}

test("stacking draw twos adds the penalty", () => {
  const game = makeGame({
    hands: [
      [card(1, CARD_TYPES.DRAW_TWO, "red")],
      [card(2, CARD_TYPES.DRAW_TWO, "blue")],
      [card(3, CARD_TYPES.NUMBER, "green", 5), card(4, CARD_TYPES.NUMBER, "green", 6), card(5, CARD_TYPES.NUMBER, "green", 7), card(6, CARD_TYPES.NUMBER, "green", 8)],
      [],
    ],
    deck: [
      card(901, CARD_TYPES.NUMBER, "red", 1),
      card(902, CARD_TYPES.NUMBER, "red", 2),
      card(903, CARD_TYPES.NUMBER, "red", 3),
      card(904, CARD_TYPES.NUMBER, "red", 4),
      card(905, CARD_TYPES.NUMBER, "red", 5),
      card(906, CARD_TYPES.NUMBER, "red", 6),
    ],
    discardPile: [card(100, CARD_TYPES.NUMBER, "red", 9)],
    currentColor: "red",
  });

  game.playCards(0, [1]);
  assert.equal(game.pendingDraw, 2);
  assert.equal(game.pendingDrawType, CARD_TYPES.DRAW_TWO);

  game.playCards(1, [2]);
  assert.equal(game.pendingDraw, 4);
  assert.equal(game.pendingDrawType, CARD_TYPES.DRAW_TWO);

  game.drawThenPlay(2);
  assert.equal(game.hands[2].length, 8);
  assert.equal(game.currentPlayer, 3);
});

test("a blocked player can pass the block to the next player", () => {
  const game = makeGame({
    hands: [
      [],
      [card(10, CARD_TYPES.BLOCK, "yellow")],
      [],
      [],
    ],
    discardPile: [card(200, CARD_TYPES.NUMBER, "yellow", 5)],
    currentColor: "yellow",
    currentPlayer: 1,
    pendingSkips: 1,
  });

  game.playCards(1, [10]);
  assert.equal(game.pendingSkips, 1);
  assert.equal(game.currentPlayer, 2);

  game.passTurn(2);
  assert.equal(game.pendingSkips, 0);
  assert.equal(game.currentPlayer, 3);
});

test("multiple same-number cards can be played in one turn", () => {
  const game = makeGame({
    hands: [
      [card(1, CARD_TYPES.NUMBER, "red", 7), card(2, CARD_TYPES.NUMBER, "blue", 7)],
      [],
      [],
      [],
    ],
    discardPile: [card(300, CARD_TYPES.NUMBER, "red", 3)],
    currentColor: "red",
  });

  game.playCards(0, [1, 2]);
  assert.equal(game.discardPile[game.discardPile.length - 1].id, 2);
  assert.equal(game.currentColor, "blue");
  assert.equal(game.hands[0].length, 0);
});

test("reverse parity follows the odd/even rule", () => {
  const game = makeGame({
    hands: [
      [card(1, CARD_TYPES.REVERSE, "red"), card(2, CARD_TYPES.REVERSE, "red")],
      [],
      [],
      [],
    ],
    discardPile: [card(400, CARD_TYPES.NUMBER, "red", 1)],
    currentColor: "red",
  });

  game.playCards(0, [1, 2]);
  assert.equal(game.direction, 1);
  assert.equal(game.currentPlayer, 1);

  const singleReverse = makeGame({
    hands: [
      [card(3, CARD_TYPES.REVERSE, "red")],
      [],
      [],
      [],
    ],
    discardPile: [card(401, CARD_TYPES.NUMBER, "red", 1)],
    currentColor: "red",
  });

  singleReverse.playCards(0, [3]);
  assert.equal(singleReverse.direction, -1);
  assert.equal(singleReverse.currentPlayer, 3);
});

test("after drawing a penalty, the player may still play a card", () => {
  const game = makeGame({
    hands: [
      [card(1, CARD_TYPES.NUMBER, "red", 5)],
      [],
      [],
      [],
    ],
    deck: [
      card(950, CARD_TYPES.NUMBER, "yellow", 1),
      card(951, CARD_TYPES.NUMBER, "blue", 2),
    ],
    discardPile: [card(500, CARD_TYPES.NUMBER, "red", 9)],
    currentColor: "red",
    pendingDraw: 2,
    pendingDrawType: CARD_TYPES.DRAW_TWO,
  });

  game.drawThenPlay(0, null, [1]);
  assert.equal(game.pendingDraw, 0);
  assert.equal(game.hands[0].length, 2);
  assert.equal(game.currentPlayer, 1);
  assert.equal(game.discardPile[game.discardPile.length - 1].id, 1);
});