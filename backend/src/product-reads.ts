import {lookupInvestorImages} from './identity/images.js';
import {getCohortPerformance} from './performance/cohort.js';
import type http from "node:http";
import { sendJson } from "./core/http.js";
import { handleExploreHome, handleExploreDirectory, handleExploreRecap } from "./explore/api.js";
import { handleInvestorDossier } from "./investigate/investor-dossier.js";
import { handleCompanyDossier } from "./research/company-dossier.js";
import { tryInvestigateRoutes } from "./investigate/api.js";
import { getCompanySnapshot } from "./core/company.js";
import { getCompanyFullCached } from "./core/ticker-context-cache.js";
import { buildPublicResearchEvent, buildPublicResearchIndex, buildPublicResearchTicker } from "./public/research.js";
import { handleAnalyseModel } from "./analyse/api.js";
import { handleResearchEvents, handleResearchRelationships, handleResearchPaper, handleResearchExplore, handleResearchFeed } from "./research/api.js";
import { getDailyCloseBars } from "./core/bars.js";
/** Existing product read endpoints. Authentication remains at the server boundary. */
export async function handleProductReads(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
  if (req.method !== "GET") return false;
  const ticker = String(url.searchParams.get("ticker") ?? "").trim().toUpperCase();
  switch (url.pathname) {
    case "/api/investor-images": {
      const names=(url.searchParams.get('names')??'').split('|').slice(0,50).map(n=>n.slice(0,150));
      try {sendJson(res,200,{ok:true,images:await lookupInvestorImages(names)});} catch {sendJson(res,503,{ok:false});}
      return true;
    }
    case "/api/public/research": {const day=url.searchParams.get("day");sendJson(res,200,await (ticker?buildPublicResearchTicker(ticker):day?buildPublicResearchEvent(day):buildPublicResearchIndex()));return true;}
    case "/api/analyse/model": await handleAnalyseModel(res,ticker); return true;
    case "/api/research/events": await handleResearchEvents(res,ticker,40); return true;
    case "/api/research/relationships": await handleResearchRelationships(res,ticker);return true;
    case "/api/research/paper": await handleResearchPaper(res,ticker);return true;
    case "/api/research/explore": await handleResearchExplore(res,ticker);return true;
    case "/api/research/feed": await handleResearchFeed(res,40,url.searchParams.get("mode"),Math.min(500,Math.max(0,Number(url.searchParams.get("offset"))||0)),url.searchParams.get("cursor"));return true;
    case "/api/outcomes": sendJson(res,200,{ok:true,empty:true,reason:"Use transaction performance in investor dossiers."});return true;

    case "/api/explore/performance": try {sendJson(res,200,await getCohortPerformance());} catch {sendJson(res,503,{ok:false});} return true;
    case "/api/explore/home": await handleExploreHome(res); return true;
    case "/api/explore/directory": await handleExploreDirectory(res); return true;
    case "/api/explore/recap": await handleExploreRecap(res); return true;
    case "/api/dossier/investor": await handleInvestorDossier(res, {slug:url.searchParams.get("slug"),name:url.searchParams.get("name"),mode:url.searchParams.get("mode")}); return true;
    case "/api/dossier/company": await handleCompanyDossier(res,ticker); return true;
    case "/api/company":
    case "/api/public/company": {
      if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) {sendJson(res,400,{ok:false,error:"invalid_ticker"}); return true;}
      const lite = url.searchParams.get("snapshot") === "1" || url.searchParams.get("lite") === "1";
      sendJson(res,200,await (lite ? getCompanySnapshot({ticker}) : getCompanyFullCached({ticker}))); return true;
    }
    case "/api/bars":
    case "/api/public/bars": {
      if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) {sendJson(res,400,{ok:false,error:"invalid_ticker"}); return true;}
      const days = Math.min(3650,Math.max(5,Number(url.searchParams.get("days")) || 365));
      const toDay = new Date().toISOString().slice(0,10);
      const fromDay = new Date(Date.now()-days*86400000).toISOString().slice(0,10);
      sendJson(res,200,await getDailyCloseBars({ticker,fromDay,toDay})); return true;
    }
  }
  return tryInvestigateRoutes(req,res,url);
}
