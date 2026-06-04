import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTemplate } from '../scripts/lib/template.mjs';

test('renderTemplate: replaces global vars', () => {
  const html = '<p>Hello {{NAME}}, you are {{AGE}}.</p>';
  const result = renderTemplate(html, { NAME: 'Alex', AGE: '30' });
  assert.equal(result, '<p>Hello Alex, you are 30.</p>');
});

test('renderTemplate: unknown keys left as-is', () => {
  const html = '{{KNOWN}} and {{UNKNOWN}}';
  const result = renderTemplate(html, { KNOWN: 'yes' });
  assert.equal(result, 'yes and {{UNKNOWN}}');
});

test('renderTemplate: expands EACH_ROW block per row', () => {
  const html = `before<!-- {{#EACH_ROW}} --><li>{{ITEM}}</li><!-- {{/EACH_ROW}} -->after`;
  const result = renderTemplate(html, {}, [{ ITEM: 'a' }, { ITEM: 'b' }]);
  assert.equal(result, 'before<li>a</li><li>b</li>after');
});

test('renderTemplate: empty rows collapses block', () => {
  const html = `x<!-- {{#EACH_ROW}} --><li>{{ITEM}}</li><!-- {{/EACH_ROW}} -->y`;
  const result = renderTemplate(html, {}, []);
  assert.equal(result, 'xy');
});

test('renderTemplate: globals apply inside row blocks', () => {
  const html = `<!-- {{#EACH_ROW}} -->{{ROW}}:{{TITLE}}<!-- {{/EACH_ROW}} -->`;
  const result = renderTemplate(html, { TITLE: 'job' }, [{ ROW: '1' }, { ROW: '2' }]);
  assert.equal(result, '1:job2:job');
});

test('renderTemplate: null value renders empty string', () => {
  const html = '{{KEY}}';
  const result = renderTemplate(html, { KEY: null });
  assert.equal(result, '');
});
