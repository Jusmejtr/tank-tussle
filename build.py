# Inline public/ into the standalone single-file game (works by double-click, file://)
s = open('public/index.html').read()
s = s.replace('<script src="config.js"></script>', '<script>\n' + open('public/config.js').read() + '\n</script>')
s = s.replace('<script src="game.js"></script>', '<script>\n' + open('public/game.js').read() + '\n</script>')
s = s.replace('<script src="bots.js"></script>', '<script>\n' + open('public/bots.js').read() + '\n</script>')
s = s.replace('<script src="client.js"></script>', '<script>\n' + open('public/client.js').read() + '\n</script>')
open('tank-tussle.html', 'w').write(s)
print('built tank-tussle.html', len(s))

# GitHub Pages copy of the static client (docs/). Only config.js differs: it points at the separately hosted server.
import shutil, os
os.makedirs('docs', exist_ok=True)
for f in ['index.html', 'game.js', 'bots.js', 'client.js']:
    shutil.copy('public/' + f, 'docs/' + f)
if not os.path.exists('docs/config.js'):
    open('docs/config.js', 'w').write("""// GitHub Pages build: the page is static, so online play needs the separately hosted server.
// Set this to the server's public URL (https:// -> the client uses wss://), e.g. 'https://tank.example.com'.
// Players can also override it with ?server=https://... in the URL. Local (same keyboard) mode never needs it.
window.TT_STATIC = true;
window.TT_SERVER_URL = '';
""")
shutil.copy('tank-tussle.html', 'docs/tank-tussle.html')
open('docs/.nojekyll', 'w').close()
print('synced docs/')
