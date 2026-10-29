/**
 * levelselect.js — the 2D level grid plus overcharge activation.
 *
 * Clearing a level unlocks the next. Overcharges owned in the inventory can be
 * toggled on here; each toggled one is consumed when the level starts.
 */
import { CONFIG } from '../config.js';
import { OVERCHARGE_IDS, OVERCHARGE_INFO } from '../overcharge.js';
import { overchargeCount } from '../economy.js';
import { el, panel, row, button, textCanvas, iconCanvas, setText } from './pixelui.js';

/**
 * @param {{save:object, selectedLevel:number, onStart:(level:number, ids:string[])=>void, onShop:()=>void, onBack:()=>void, audio:object}} ctx
 */
export function buildLevelSelect(ctx) {
  const { save } = ctx;
  let selected = Math.min(ctx.selectedLevel || 1, save.highestUnlocked);
  const active = new Set();

  const title = textCanvas('SELECT LEVEL', { scale: 4, color: 13, shadow: 17 });
  const gripLine = row('grip-line', iconCanvas('grip', 3), textCanvas(String(save.grip), { scale: 3, color: 14, shadow: 0 }));

  // ── level grid ─────────────────────────────────────────────────────────────
  const grid = el('div', 'level-grid');
  const cells = [];
  const info = textCanvas('', { scale: 2, color: 4 });
  const infoBest = textCanvas('', { scale: 2, color: 13 });

  function refreshInfo() {
    const rec = save.levels[selected];
    setText(info, `LEVEL ${selected}  TARGET ${CONFIG.levels.returnTarget(selected)}`);
    setText(infoBest, rec && rec.cleared ? `BEST ${rec.bestScore}  CONCEDED ${rec.bestConceded}` : (rec ? `BEST RETURNS ${rec.bestReturns}` : 'NOT YET PLAYED'));
    for (const c of cells) c.btn.classList.toggle('selected', c.level === selected);
  }

  for (let level = 1; level <= CONFIG.levels.count; level++) {
    const unlocked = level <= save.highestUnlocked;
    const rec = save.levels[level];
    const btn = button(String(level), () => {
      selected = level;
      ctx.audio.play('click');
      refreshInfo();
    }, { scale: 4, cls: 'level-cell' });
    if (!unlocked) {
      btn.classList.add('disabled', 'locked');
      btn.appendChild(iconCanvas('lock', 2));
    } else if (rec && rec.cleared) {
      btn.appendChild(iconCanvas(rec.bestConceded === 0 ? 'star' : 'tick', 2));
    }
    grid.appendChild(btn);
    cells.push({ level, btn });
  }

  // ── overcharges ────────────────────────────────────────────────────────────
  const overTitle = textCanvas('OVERCHARGES', { scale: 2, color: 4 });
  const overRow = row('over-row');
  for (const id of OVERCHARGE_IDS) {
    const count = overchargeCount(save, id);
    const countText = textCanvas(`X${count}`, { scale: 2, color: 4 });
    const btn = button(OVERCHARGE_INFO[id].short, () => {
      if (active.has(id)) active.delete(id); else active.add(id);
      btn.classList.toggle('active', active.has(id));
      ctx.audio.play('click');
    }, { scale: 2, cls: 'over-card', icon: iconCanvas(OVERCHARGE_INFO[id].icon, 3) });
    btn.appendChild(countText);
    if (count === 0) btn.classList.add('disabled');
    overRow.appendChild(btn);
  }

  // ── actions ────────────────────────────────────────────────────────────────
  const start = button('START', () => ctx.onStart(selected, [...active]), { scale: 4, color: 13, cls: 'primary' });
  const shop = button('SHOP', () => ctx.onShop(), { scale: 3 });
  const back = button('BACK', () => ctx.onBack(), { scale: 3 });

  refreshInfo();
  const screen = el('div', 'screen level-select',
    title,
    gripLine,
    panel('grid-panel', grid, info, infoBest),
    panel('over-panel', overTitle, overRow),
    row('actions', back, shop, start),
  );
  screen._defaultFocus = start;
  return screen;
}
