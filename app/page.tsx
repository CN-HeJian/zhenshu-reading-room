"use client";

import { useMemo, useState } from "react";

const books = [
  { title: "我与地坛", author: "史铁生", progress: 72, mark: "正在读", color: "#8f4038" },
  { title: "悉达多", author: "赫尔曼·黑塞", progress: 100, mark: "读完了", color: "#315c4b" },
  { title: "禅与摩托车维修艺术", author: "罗伯特·波西格", progress: 41, mark: "正在读", color: "#334867" },
  { title: "秋园", author: "杨本芬", progress: 100, mark: "读完了", color: "#b27332" },
];

const notes = [
  { book: "我与地坛", date: "六月二十八", quote: "一个人，出生了，这就不再是一个可以辩论的问题。", note: "命运不是结论，而是我们开始理解自己的地方。", tag: "生命" },
  { book: "悉达多", date: "五月十六", quote: "知识可以传授，智慧却不能。", note: "真正抵达我的句子，总要先经过生活。", tag: "成长" },
  { book: "秋园", date: "四月初九", quote: "她的一生就这样在时代的缝隙里缓缓展开。", note: "普通人的历史，也应当被郑重地看见。", tag: "记忆" },
];

export default function Home() {
  const [tab, setTab] = useState<"书架" | "批注">("书架");
  const [query, setQuery] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const filtered = useMemo(() => books.filter((b) => `${b.title}${b.author}`.includes(query)), [query]);

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="枕书首页"><span>枕</span>书</a>
        <nav aria-label="主导航">
          <button className={tab === "书架" ? "active" : ""} onClick={() => setTab("书架")}>我的书架</button>
          <button className={tab === "批注" ? "active" : ""} onClick={() => setTab("批注")}>阅读批注</button>
        </nav>
        <div className="actions">
          <label className="search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索书名或作者" /></label>
          <button className="import" onClick={() => setImportOpen(true)}>＋ 导入微信内容</button>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow">MY READING ROOM · 二〇二六</div>
        <h1>书页之间，<br /><em>安放自己的声音。</em></h1>
        <p>收藏读过的文字，也收藏当时的你。这里有原文、有批注，<br />还有那些在微信里匆匆记下、值得再读一遍的念头。</p>
        <div className="stats"><b>24<small>本书</small></b><i /><b>186<small>条批注</small></b><i /><b>3,472<small>页已读</small></b></div>
        <div className="seal">读<br />书</div>
      </section>

      {tab === "书架" ? (
        <section className="content">
          <div className="sectionHead"><div><span>01 / SHELF</span><h2>最近阅读</h2></div><button onClick={() => setTab("批注")}>查看全部批注 →</button></div>
          <div className="shelf">
            {filtered.map((book, index) => <article className="bookCard" key={book.title}>
              <div className="cover" style={{ background: book.color }}><small>枕书藏本 · {String(index + 1).padStart(2, "0")}</small><strong>{book.title}</strong><span>{book.author}</span></div>
              <div className="bookMeta"><span>{book.mark}</span><b>{book.title}</b><small>{book.author}</small><div className="progress"><i style={{ width: `${book.progress}%` }} /></div><em>{book.progress}%</em></div>
            </article>)}
          </div>
          {!filtered.length && <p className="empty">没有找到这本书，换个关键词试试。</p>}
        </section>
      ) : (
        <section className="content notesPage">
          <div className="sectionHead"><div><span>02 / MARGINALIA</span><h2>阅读批注</h2></div><button onClick={() => setTab("书架")}>← 返回书架</button></div>
          <div className="notes">{notes.map((n, i) => <article className="note" key={n.book}><div className="noteNo">0{i + 1}</div><div><span>{n.book} · {n.date}</span><blockquote>“{n.quote}”</blockquote><p>{n.note}</p><small>#{n.tag}</small></div></article>)}</div>
        </section>
      )}

      <section className="reading">
        <div><span>本周共读</span><h2>我与地坛</h2><p>在最狂妄的年龄忽地残废了双腿，史铁生摇着轮椅走进地坛。从此，古园的四季、母亲的身影与对命运的追问，成为漫长生命里不熄的回响。</p><button onClick={() => setTab("批注")}>继续阅读　→</button></div>
        <blockquote><b>“</b>我什么都没有忘，<br />但是有些事只适合收藏。<small>—— 史铁生《我与地坛》</small></blockquote>
      </section>

      <footer><span>枕书 · 私人阅读札记</span><i>愿每一次翻页，都能听见自己。</i><span>二〇二六</span></footer>

      {importOpen && <div className="modal" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(e) => e.target === e.currentTarget && setImportOpen(false)}>
        <div className="dialog"><button className="close" aria-label="关闭" onClick={() => setImportOpen(false)}>×</button><span className="dialogEyebrow">WECHAT IMPORT</span><h2 id="import-title">把微信里的阅读痕迹带回来</h2><p>粘贴微信公众号文章链接，或直接粘贴原文与评论。连接微信 skill 后，这里也可以一键同步你的评论。</p><label>文章链接 / 原文<textarea placeholder="粘贴微信文章链接或正文……" /></label><label>我的评论<textarea placeholder="粘贴你在微信里的评论或读后感……" /></label><button className="save" onClick={() => setSaved(true)}>{saved ? "已保存到阅读札记 ✓" : "保存并生成阅读卡片"}</button><small>仅导入你有权保存与使用的内容。</small></div>
      </div>}
    </main>
  );
}
