const key = 'forest-guestbook-v1';
let entries = [];
const status = document.getElementById('message-status');
try { entries = JSON.parse(localStorage.getItem(key) || '[]'); if (!Array.isArray(entries)) entries = []; } catch { status.textContent = '浏览器暂时无法读取本地留言。'; }
function render() {
 const list = document.getElementById('message-list'); list.replaceChildren();
 entries.forEach(entry => {
  const article = document.createElement('article'); article.className = 'message-entry';
  const name = document.createElement('strong'); name.textContent = '称谓：' + entry.name;
  const time = document.createElement('time'); time.textContent = entry.date;
  const contact = document.createElement('p'); contact.textContent = '联系方式：' + (entry.contact || '未填写');
  const text = document.createElement('p'); text.textContent = '留言：' + entry.text;
  article.append(name,time,contact,text); list.append(article);
 });
}
document.getElementById('message-form').addEventListener('submit', event => {
 event.preventDefault();
 const input = document.getElementById('message'); const text = input.value.trim();
 if (!text) { status.textContent = '先写下一句话吧。'; input.focus(); return; }
 const next = [{name: document.getElementById('nickname').value.trim() || '路过的旅人', contact: document.getElementById('contact').value.trim(), text, date: new Date().toLocaleString('zh-CN')}, ...entries];
 try { localStorage.setItem(key, JSON.stringify(next)); entries = next; render(); input.value = ''; status.textContent = '留言已保存在当前浏览器。'; } catch { status.textContent = '保存失败，请检查浏览器存储设置；你输入的内容已保留。'; }
});
render();

