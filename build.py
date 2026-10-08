import json, re
t = open('src/template.html', encoding='utf-8').read()
css = open('src/style.css', encoding='utf-8').read()
data = open('data.json', encoding='utf-8').read()
logic = open('src/logic.js', encoding='utf-8').read()
logic = logic.split("if (typeof module !== 'undefined')")[0]
app = open('src/logo.js', encoding='utf-8').read() + '\n' + open('src/insights.js', encoding='utf-8').read() + '\n' + open('src/taste.js', encoding='utf-8').read() + '\n' + open('src/app.js', encoding='utf-8').read()
prices = open('prijzen.json', encoding='utf-8').read()
out = t.replace('/*CSS*/', css).replace('/*DATA*/', 'const BASE = ' + data + ';\nconst EMBED = ' + prices + ';').replace('/*LOGIC*/', logic).replace('/*APP*/', app)
open('index.html', 'w', encoding='utf-8').write(out)
print('index.html', len(out) // 1024, 'KB')
