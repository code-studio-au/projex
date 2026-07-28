import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  buildEmailChangeVerificationMessage,
  buildPasswordSetupEmailMessage,
} from '../src/server/email/authMessages.ts';
import { escapeEmailHtml } from '../src/server/email/html.ts';

const hostileName = `Pat <img src=x onerror="alert(1)"> & 'Team'`;
const hostileUrl =
  `https://app.example.com/verify?token=abc&next="` +
  `><img src=x onerror='alert(1)'>`;

test('email HTML escaping covers text and attribute metacharacters', () => {
  assert.equal(
    escapeEmailHtml(`<tag attr="'">& value`),
    '&lt;tag attr=&quot;&#39;&quot;&gt;&amp; value'
  );
});

test('password setup email escapes names and link attributes', () => {
  const message = buildPasswordSetupEmailMessage({
    recipientName: hostileName,
    recipientEmail: 'pat@example.com',
    url: hostileUrl,
  });

  assert.match(message.text, /Pat <img/);
  assert.doesNotMatch(message.html, /<img/);
  assert.match(
    message.html,
    /Pat &lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; &#39;Team&#39;/
  );
  assert.match(
    message.html,
    /href="https:\/\/app\.example\.com\/verify\?token=abc&amp;next=&quot;&gt;&lt;img src=x onerror=&#39;alert\(1\)&#39;&gt;"/
  );
});

test('email change verification escapes names and link attributes', () => {
  const message = buildEmailChangeVerificationMessage({
    currentName: hostileName,
    currentEmail: 'pat@example.com',
    url: hostileUrl,
  });

  assert.match(message.text, /Pat <img/);
  assert.doesNotMatch(message.html, /<img/);
  assert.match(
    message.html,
    /Pat &lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; &#39;Team&#39;/
  );
  assert.match(
    message.html,
    /href="https:\/\/app\.example\.com\/verify\?token=abc&amp;next=&quot;&gt;&lt;img src=x onerror=&#39;alert\(1\)&#39;&gt;"/
  );
});
