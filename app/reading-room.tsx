"use client";

import type { DashboardData, DashboardPeriod } from "@/lib/dashboard";
import { buildWeReadLink, formatDate, formatDuration } from "@/lib/weread/core.mjs";
import { useEffect, useMemo, useRef, useState } from "react";

type PublicRun = NonNullable<DashboardData["latestSync"]>;
type Tab = "书架" | "批注";

const coverColors = ["#8f4038", "#315c4b", "#334867", "#b27332", "#6c4b3f", "#4f5e69"];
const stageLabels: Record<PublicRun["stage"], string> = {
  shelf: "整理书架",
  progress: "更新阅读进度",
  notebooks: "读取笔记目录",
  notes: "同步划线与想法",
  stats: "汇总阅读统计",
  complete: "同步完成",
};

function formatSyncTime(value: number | null) {
  if (!value) return "尚未同步";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function progressText(run: PublicRun | null) {
  if (!run) return "准备连接微信读书";
  if (run.status === "failed") return run.errorMessage ?? "同步失败，旧数据已保留。";
  if (run.status === "partial_success") return run.errorMessage ?? "部分内容暂未同步，旧数据已保留。";
  if (run.status === "success") return "最新阅读内容已经回到枕书。";
  return stageLabels[run.stage];
}

function periodCopy(period: DashboardPeriod) {
  const comparison = period.compare === null
    ? ""
    : period.compare >= 0
      ? `，较上一周期增长 ${Math.round(period.compare * 100)}%`
      : `，较上一周期减少 ${Math.abs(Math.round(period.compare * 100))}%`;
  return `阅读 ${period.readDays} 天，自然日均 ${formatDuration(period.dayAverageSeconds)}${comparison}`;
}

export default function ReadingRoom({ initialData }: { initialData: DashboardData }) {
  const [tab, setTab] = useState<Tab>("书架");
  const [query, setQuery] = useState("");
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncRun, setSyncRun] = useState<PublicRun | null>(initialData.latestSync);
  const [syncing, setSyncing] = useState(false);
  const catchUpStarted = useRef(false);

  const filteredBooks = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return initialData.books;
    return initialData.books.filter((book) => `${book.title}${book.author}`.toLowerCase().includes(keyword));
  }, [initialData.books, query]);
  const filteredNotes = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return initialData.notes;
    return initialData.notes.filter((note) => `${note.book}${note.quote}${note.note}`.toLowerCase().includes(keyword));
  }, [initialData.notes, query]);

  async function runSync(source: "manual" | "catch_up") {
    if (syncing) return;
    setSyncing(true);
    if (source === "manual") setSyncOpen(true);
    try {
      let response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      if (!response.ok) throw new Error(await response.text());
      let current = await response.json() as PublicRun;
      setSyncRun(current);

      while (current.status === "running") {
        await new Promise((resolve) => setTimeout(resolve, 180));
        response = await fetch(`/api/sync/${encodeURIComponent(current.id)}/continue`, { method: "POST" });
        if (!response.ok) throw new Error(await response.text());
        current = await response.json() as PublicRun;
        setSyncRun(current);
      }
      if (current.status === "success" || current.status === "partial_success") {
        window.setTimeout(() => window.location.reload(), 900);
      }
    } catch {
      setSyncRun({
        id: "local-error",
        source,
        status: "failed",
        stage: "complete",
        startedAt: Date.now(),
        updatedAt: Date.now(),
        finishedAt: Date.now(),
        shelfCount: initialData.shelfCount,
        progressUpdated: 0,
        notesUpdated: 0,
        statsUpdated: 0,
        errorCode: "request_failed",
        errorMessage: "暂时无法完成同步，旧数据仍然安全保留。",
        progress: {
          books: { completed: 0, total: 0 },
          notebooks: { completed: 0, total: 0 },
          stats: { completed: 0, total: 4 },
        },
      });
      setSyncOpen(true);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (initialData.databaseReady && initialData.needsCatchUp && !catchUpStarted.current) {
      catchUpStarted.current = true;
      void runSync("catch_up");
    }
  // The catch-up decision belongs to the server-rendered snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const latestBook = initialData.books.find((book) => book.progress > 0 && book.progress < 100)
    ?? initialData.books[0];
  const hasData = initialData.books.length > 0 || initialData.notes.length > 0;

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="枕书首页"><span>枕</span>书</a>
        <nav aria-label="主导航">
          <button className={tab === "书架" ? "active" : ""} onClick={() => setTab("书架")}>我的书架</button>
          <button className={tab === "批注" ? "active" : ""} onClick={() => setTab("批注")}>阅读批注</button>
        </nav>
        <div className="actions">
          <label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索书名或内容" /></label>
          <button className="import" disabled={syncing} onClick={() => void runSync("manual")}>
            {syncing ? "同步中…" : "↻ 立即同步"}
          </button>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow">MY READING ROOM · 二〇二六</div>
        <h1>书页之间，<br /><em>安放自己的声音。</em></h1>
        <p>收藏读过的文字，也收藏当时的你。这里有原文、有批注，<br />还有那些在微信读书里写下、值得再读一遍的念头。</p>
        <div className="stats">
          <b>{initialData.shelfCount}<small>个书架条目</small></b><i />
          <b>{initialData.noteCount}<small>条笔记</small></b><i />
          <b>{formatDuration(initialData.overallSeconds)}<small>累计阅读</small></b>
        </div>
        <div className="seal">读<br />书</div>
      </section>

      {tab === "书架" ? (
        <section className="content">
          <div className="sectionHead">
            <div><span>01 / SHELF</span><h2>我的书架</h2></div>
            <button onClick={() => setTab("批注")}>查看全部批注 →</button>
          </div>
          <div className="shelf">
            {filteredBooks.map((book, index) => (
              <article className="bookCard" key={book.id}>
                <a
                  className={`cover${book.cover ? " hasCover" : ""}`}
                  href={book.link ?? undefined}
                  style={{
                    backgroundColor: coverColors[index % coverColors.length],
                    ...(book.cover ? { backgroundImage: `linear-gradient(180deg, #18130b10, #18130bc9), url(${JSON.stringify(book.cover).slice(1, -1)})` } : {}),
                  }}
                >
                  <small>枕书藏本 · {String(index + 1).padStart(2, "0")}</small>
                  <strong>{book.title}</strong><span>{book.author || book.category || "微信读书"}</span>
                </a>
                <div className="bookMeta">
                  <span>{book.status}</span><b>{book.title}</b><small>{book.author || book.category || "微信读书"}</small>
                  <div className="progress"><i style={{ width: `${book.progress}%` }} /></div><em>{book.progress}%</em>
                </div>
              </article>
            ))}
          </div>
          {!filteredBooks.length && (
            <div className="empty">
              <p>{hasData ? "没有找到这本书，换个关键词试试。" : "书架还没有内容，先从微信读书同步一次。"}</p>
              {!hasData && <button className="save inlineSync" onClick={() => void runSync("manual")}>立即同步</button>}
            </div>
          )}
        </section>
      ) : (
        <section className="content notesPage">
          <div className="sectionHead">
            <div><span>02 / MARGINALIA</span><h2>阅读批注</h2></div>
            <button onClick={() => setTab("书架")}>← 返回书架</button>
          </div>
          <div className="notes">
            {filteredNotes.map((note, index) => (
              <article className="note" key={`${note.kind}:${note.id}`}>
                <div className="noteNo">{String(index + 1).padStart(2, "0")}</div>
                <div>
                  <span>{note.book} · {note.createTime ? formatDate(note.createTime) : "日期未知"}{note.chapter ? ` · ${note.chapter}` : ""}</span>
                  {note.quote && <blockquote>“{note.quote}”</blockquote>}
                  {note.note && <p>{note.note}</p>}
                  <div className="noteFooter"><small>{note.kind === "highlight" ? "#划线" : "#想法"}</small>{note.link && <a href={note.link}>在微信读书中打开 →</a>}</div>
                </div>
              </article>
            ))}
            {!filteredNotes.length && <p className="empty">{hasData ? "没有找到相关批注。" : "同步后，你的划线和想法会出现在这里。"}</p>}
          </div>
        </section>
      )}

      <section className="reading">
        <div>
          <span>READING FOOTPRINT · 本周</span>
          <h2>{formatDuration(initialData.week.totalSeconds)}</h2>
          <p>{periodCopy(initialData.week)}。{initialData.week.topTitle ? `本周读得最多的是《${initialData.week.topTitle}》。` : "阅读数据会在同步后慢慢长成你的足迹。"}</p>
          {latestBook?.sourceType === "book" && <a className="readingLink" href={buildWeReadLink({ bookId: latestBook.sourceId }) ?? undefined}>继续阅读　→</a>}
        </div>
        <blockquote>
          <b>“</b>近 30 天<br />{formatDuration(initialData.month.totalSeconds)}
          <small>累计阅读 · {formatDuration(initialData.overall.totalSeconds)}</small>
        </blockquote>
      </section>

      <footer>
        <span>枕书 · 私人阅读札记</span><i>愿每一次翻页，都能听见自己。</i>
        <span>上次同步 · {formatSyncTime(initialData.lastSuccessAt)}</span>
      </footer>

      {syncOpen && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="sync-title" onMouseDown={(event) => event.target === event.currentTarget && !syncing && setSyncOpen(false)}>
          <div className="dialog syncDialog">
            <button className="close" aria-label="关闭" disabled={syncing} onClick={() => setSyncOpen(false)}>×</button>
            <span className="dialogEyebrow">WEREAD SYNC</span>
            <h2 id="sync-title">把微信读书里的阅读痕迹带回来</h2>
            <p>{progressText(syncRun)}</p>
            <div className="syncProgress" aria-live="polite">
              <div><span>书架</span><b>{syncRun?.shelfCount ?? initialData.shelfCount}</b></div>
              <div><span>进度更新</span><b>{syncRun?.progressUpdated ?? 0}</b></div>
              <div><span>笔记内容</span><b>{syncRun?.notesUpdated ?? 0}</b></div>
              <div><span>统计周期</span><b>{syncRun?.statsUpdated ?? 0}/4</b></div>
            </div>
            {syncRun?.status === "running" && <div className="syncLine"><i /></div>}
            <button className="save" disabled={syncing} onClick={() => syncing ? undefined : void runSync("manual")}>
              {syncing ? "正在同步，请稍候…" : syncRun?.status === "failed" ? "重新同步" : "再次同步"}
            </button>
            <small>微信读书密钥只在服务端使用；同步失败不会覆盖旧数据。</small>
          </div>
        </div>
      )}
    </main>
  );
}
