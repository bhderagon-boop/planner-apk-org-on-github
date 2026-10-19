// وب‌اپ را آماده‌ی Capacitor می‌کند: web/ -> www/ و بسته‌بندی src/native.js
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = __dirname;
const out = path.join(root, 'www');

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'web'), out, { recursive: true });

esbuild.buildSync({
    entryPoints: [path.join(root, 'src', 'native.js')],
    bundle: true,
    minify: true,
    format: 'iife',
    target: 'chrome90',
    outfile: path.join(out, 'assets', 'native.js'),
    logLevel: 'info',
});
console.log('✔ www/ آماده است');
