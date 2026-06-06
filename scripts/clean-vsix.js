// Removes all *.vsix files from the repo root before packaging.
// Runs automatically via the "prepackage" npm hook.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const removed = fs.readdirSync(root)
    .filter(f => f.endsWith('.vsix'))
    .map(f => {
        const full = path.join(root, f);
        fs.unlinkSync(full);
        return f;
    });

if (removed.length > 0) {
    console.log(`Removed old VSIX: ${removed.join(', ')}`);
} else {
    console.log('No old VSIX files to remove.');
}
