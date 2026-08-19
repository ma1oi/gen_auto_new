// ==UserScript==
// @name         Jira WPROMO — автозаполнение "Финальная проверка"
// @namespace    gen-auto-pipeline
// @version      3.3
// @description  На экране перехода "Финальная проверка" подставляет домен (если пуст — берёт из описания задачи) и IP сервера (ищет по домену через Gen_Auto, под гугл-аккаунтом этого пользователя)
// @match        https://jira.lucky-team.pro/browse/*
// @grant        GM_xmlhttpRequest
// @connect      localhost
// @connect      127.0.0.1
// @connect      __API_HOST__
// ==/UserScript==

(function () {
  "use strict";


  const API_BASE = "__API_BASE__";
  const JIRA_USER = "__JIRA_USER__";

  function setNativeValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function fillServer(serverInput, domain) {
    GM_xmlhttpRequest({
      method: "GET",
      url: `${API_BASE}/api/pipeline/server-for-domain?domain=${encodeURIComponent(domain)}&jiraUser=${encodeURIComponent(JIRA_USER)}`,
      onload(res) {
        let data;
        try {
          data = JSON.parse(res.responseText);
        } catch (e) {
          console.warn("[gen_auto autofill] не удалось разобрать ответ:", res.responseText);
          return;
        }
        if (data.found && data.ip && !serverInput.value.trim()) {
          setNativeValue(serverInput, data.ip);
        } else if (data.error) {
          // не путать с "домена нет в таблице" — это реальный сбой (не
          // подключён Google, протух токен, упал сам скрипт на сервере и т.п.)
          console.warn(`[gen_auto autofill] ошибка поиска IP для ${domain}: ${data.error}`);
        } else if (!data.found) {
          console.warn(`[gen_auto autofill] IP для домена ${domain} не найден в таблице`);
        }
      },
      onerror() {
        console.warn(`[gen_auto autofill] не удалось достучаться до ${API_BASE} — gen_auto запущен?`);
      },
    });
  }

  function extractDomainFromDescription(descText) {
    const patterns = [
      /\[([a-z0-9][a-z0-9.-]+\.[a-z]{2,})\|http/i,
      /\|([a-z0-9][a-z0-9.-]+\.[a-z]{2,})\|/i,
      /купить\s+домен\s+([a-z0-9][a-z0-9.-]+\.[a-z]{2,})/i,
      /вайт[еа]?\s+([a-z0-9][a-z0-9.-]+\.[a-z]{2,})/i,
      /домен[еа]?\s+(?:\S+\s+){0,8}([a-z0-9][a-z0-9.-]+\.[a-z]{2,})/i,
    ];
    for (const re of patterns) {
      const m = descText.match(re);
      if (m) return m[1];
    }
    const SKIP_DOMAINS = /^(jira\.|whitegen\.|lucky-team\.|fonts\.|cdnjs\.|unpkg\.)/i;
    const all = [...descText.matchAll(/\b([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|de|co\.uk|fr|es|it|nl|pl|ro|ru|uk|ch|at|be|au|ca|nz|info|biz|online|site|store|shop))\b/gi)];
    const found = all.map((m) => m[1]).find((d) => !SKIP_DOMAINS.test(d));
    return found || "";
  }

  function getIssueKeyFromUrl() {
    const m = location.pathname.match(/\/browse\/([A-Z]+-\d+)/i);
    return m ? m[1].toUpperCase() : null;
  }

  async function fetchDescriptionText(issueKey) {
    const res = await fetch(
      `/rest/greenhopper/1.0/xboard/issue/details.json?rapidViewId=520&issueIdOrKey=${issueKey}&loadSubtasks=true&_=${Date.now()}`,
      {
        headers: { accept: "application/json, text/javascript, */*; q=0.01", "x-requested-with": "XMLHttpRequest" },
        credentials: "include",
      }
    );
    if (!res.ok) throw new Error(`Jira REST вернул ${res.status}`);
    const data = await res.json();
    const editable = data?.tabs?.defaultTabs?.[1]?.inlineEditableFields || [];
    const descField = editable.find((f) => f.id === "description");
    const m = (descField?.editHtml || "").match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/);
    return m ? m[1] : "";
  }

  async function checkAndFill() {
    const serverInput = document.getElementById("customfield_14607");
    const domainInput = document.getElementById("customfield_14608");

    if (!serverInput || !domainInput) return;
    if (serverInput.dataset.gaHandled) return; // уже обработали этот экземпляр диалога
    serverInput.dataset.gaHandled = "1";

    let domain = domainInput.value.trim();

    // Описание задачи нужно в любом случае: не только чтобы найти домен,
    // если он пуст в модалке, но и чтобы проверить IP-деплой (см. ниже) —
    // ровно то же самое description-задачи, что смотрит deploy.py.
    let descText = "";
    const issueKey = getIssueKeyFromUrl();
    if (issueKey) {
      try {
        descText = await fetchDescriptionText(issueKey);
      } catch (e) {
        console.warn("[gen_auto autofill] не удалось получить описание задачи:", e);
      }
    }

    if (!domain && descText) {
      const extracted = extractDomainFromDescription(descText);
      if (extracted) {
        domain = extracted;
        setNativeValue(domainInput, domain);
        console.log(`[gen_auto autofill] домен пуст в модалке, взял из описания задачи: ${domain}`);
      } else {
        console.warn("[gen_auto autofill] домен не найден ни в модалке, ни в описании задачи");
      }
    }

    const ipMatch = descText.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
    if (ipMatch) {
      console.log(`[gen_auto autofill] нашёл IP сервера прямо в описании задачи: ${ipMatch[0]}`);
      if (!serverInput.value.trim()) setNativeValue(serverInput, ipMatch[0]);
      return;
    }

    if (domain) fillServer(serverInput, domain);
  }

  const observer = new MutationObserver(() => checkAndFill());
  observer.observe(document.body, { childList: true, subtree: true });

  checkAndFill();
})();
