import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasDocument, createCanvasNode, type Frame } from '@webdock/page-builder/model';
import { commitHistory, initialHistory, pointerFrame, redoHistory, reorderNode, setNodeFrame, undoHistory, type ResizeHandle } from './history';

test('a complete drag is one history step and undo restores the pre-gesture document', () => {
  const original = createCanvasDocument('Example', 'example'); original.nodes.push(createCanvasNode('text'));
  let history = initialHistory(original);
  for (let x = 1; x <= 100; x++) history = { ...history, present: setNodeFrame(history.present, original.nodes[0].id, 'desktop', { ...original.nodes[0].frames.desktop, x }) };
  history = commitHistory(history, history.present, original);
  assert.equal(history.past.length, 1);
  assert.deepEqual(undoHistory(history).present, original);
  assert.deepEqual(redoHistory(undoHistory(history)).present, history.present);
  assert.equal(history.present.nodes[0].frames.mobile.x, original.nodes[0].frames.mobile.x);
  assert.equal(commitHistory(history, history.present).past.length, 1);
});
test('pointer conversion accounts for zoom and each resize handle preserves the opposite edge', () => {
  const frame: Frame = { x: 30, y: 40, width: 100, height: 80, hidden: false };
  assert.deepEqual(pointerFrame(frame, 20, 10, .5), { ...frame, x: 70, y: 60 });
  for (const handle of ['n','ne','e','se','s','sw','w','nw'] as ResizeHandle[]) {
    const result = pointerFrame(frame, 10, 10, .5, handle);
    if (handle.includes('w')) assert.equal(result.x + result.width, frame.x + frame.width);
    else assert.equal(result.x, frame.x);
    if (handle.includes('n')) assert.equal(result.y + result.height, frame.y + frame.height);
    else assert.equal(result.y, frame.y);
    assert.equal(result.width, handle.includes('w') ? 80 : handle.includes('e') ? 120 : 100);
    assert.equal(result.height, handle.includes('n') ? 60 : handle.includes('s') ? 100 : 80);
  }
  assert.equal(pointerFrame(frame, 1000, 1000, .5, 'nw').width, 1);
  assert.equal(pointerFrame(frame, 1000, 1000, .5, 'nw').height, 1);
});
test('reordering changes only layer order and a new change clears redo history', () => {
  const original = createCanvasDocument('Example', 'example');
  original.nodes.push(createCanvasNode('box'), createCanvasNode('text'));
  const moved = reorderNode(original, original.nodes[0].id, 1);
  assert.deepEqual(moved.nodes, [original.nodes[1], original.nodes[0]]);
  assert.equal(reorderNode(original, original.nodes[0].id, -1), original);
  const undone = undoHistory(commitHistory(initialHistory(original), moved));
  const changed = commitHistory(undone, { ...original, title: 'Changed' });
  assert.equal(changed.future.length, 0);
  assert.deepEqual(original.nodes.map(node => node.type), ['box','text']);
});
