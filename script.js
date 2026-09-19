const menuToggle = document.querySelector('.mobile-menu');
const sideNav = document.querySelector('.side-nav');
const toast = document.querySelector('#save-toast');

document.querySelector('#enter-site')?.addEventListener('click', () => {
  document.body.classList.add('entered');
  window.scrollTo({ top: 0, behavior: 'instant' });
});

menuToggle?.addEventListener('click', () => {
  const open = sideNav.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(open));
});

document.querySelectorAll('.side-nav a').forEach((link) => {
  link.addEventListener('click', () => {
    sideNav.classList.remove('open');
    menuToggle?.setAttribute('aria-expanded', 'false');
  });
});

const editable = [...document.querySelectorAll('[data-editable]')];
const storageKey = 'wang-shuai-jiang-forest-site';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch (_) { saved = {}; }
editable.forEach((node) => {
  const value = saved[node.dataset.editable];
  if (value) node.innerHTML = value;
});

document.querySelector('#save-content')?.addEventListener('click', () => {
  const next = {};
  editable.forEach((node) => { next[node.dataset.editable] = node.innerHTML; });
  localStorage.setItem(storageKey, JSON.stringify(next));
  toast.textContent = '内容已保存到这台设备';
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2200);
});

const sections = [...document.querySelectorAll('.section-anchor')];
const navLinks = [...document.querySelectorAll('.side-nav a')];
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    navLinks.forEach((link) => link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`));
  });
}, { rootMargin: '-35% 0px -55% 0px' });
sections.forEach((section) => observer.observe(section));

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => { if (entry.isIntersecting) entry.target.classList.add('visible'); });
}, { threshold: 0.08 });
document.querySelectorAll('.reveal').forEach((node) => revealObserver.observe(node));
