// Hỏi bí mật (mật khẩu Admin) ở terminal, không hiện ký tự gõ. Dùng chung cho macOS và Windows (không cần PowerShell/bash).
// Thay cho việc launcher từng OS tự hỏi: logic nằm một chỗ, kiểm thử được.
import { stdin as defaultIn, stdout as defaultOut } from 'node:process';

/**
 * @param {string} question
 * @param {{input?:NodeJS.ReadableStream & {isTTY?:boolean, setRawMode?:Function}, output?:NodeJS.WritableStream}} io
 * @returns {Promise<string>} chuỗi đã nhập (không gồm xuống dòng)
 */
export function promptSecret(question, { input = defaultIn, output = defaultOut } = {}) {
  return new Promise((resolve, reject) => {
    if (!input.isTTY && typeof input.setRawMode !== 'function' && !input.__testStream) {
      return reject(new Error('Không có terminal tương tác để nhập mật khẩu. Hãy chạy bằng launcher (bấm đúp) hoặc đặt NOVA_ADMIN_PASSWORD.'));
    }
    output.write(question);
    let buf = '';
    const raw = typeof input.setRawMode === 'function';
    if (raw) input.setRawMode(true);
    input.resume();
    input.setEncoding?.('utf8');
    const finish = (fn) => {
      input.removeListener('data', onData);
      if (raw) input.setRawMode(false);
      input.pause?.();
      output.write('\n');
      fn();
    };
    function onData(chunk) {
      for (const ch of String(chunk)) {
        if (ch === '\r' || ch === '\n') return finish(() => resolve(buf));
        if (ch === '\u0003') return finish(() => reject(new Error('Đã huỷ nhập mật khẩu (Ctrl+C).'))); // Ctrl+C ở chế độ raw
        if (ch === '\u007f' || ch === '\b') buf = buf.slice(0, -1); // xoá lùi
        else if (ch >= ' ') buf += ch;
      }
      return undefined;
    }
    input.on('data', onData);
    return undefined;
  });
}
