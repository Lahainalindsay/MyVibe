"""
VIBE Social Agent (X + Discord) — Culture-First / Coordination Experiment
Now with Engagement Router:
- Classifies inbound messages: supporter | curious | skeptic | troll | price_chaser
- Applies reply policy: reply | short_reply | redirect | ignore
- Rate limits per user and cooldowns
- Blocklist + ignore keyword filters

Install
- pip install tweepy==4.14.0 discord.py==2.4.0 python-dotenv==1.0.1

Run
- python agent.py
"""

from __future__ import annotations

import asyncio
import hashlib
import os
import random
import re
import signal
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

import tweepy
import discord
from discord import Intents

try:
    from dotenv import load_dotenv
except Exception:  # pragma: no cover
    load_dotenv = None


# -----------------------------
# Config
# -----------------------------

@dataclass(frozen=True)
class Config:
    tz_offset_minutes: int

    # Posting cadence
    post_window_start_hour: int
    post_window_end_hour: int
    weekly_long_post_weekday: int  # 0=Mon ... 6=Sun
    weekly_long_post_hour: int

    # Reply cadence
    x_poll_seconds: int

    # Discord
    discord_channel_id: int
    discord_enable_onboarding_autopost: bool

    # Engagement router controls
    per_user_cooldown_seconds: int
    per_user_max_replies_per_day: int
    ignore_if_contains_any: tuple[str, ...]
    blocklist_user_ids: tuple[str, ...]  # works for Discord author.id and X author_id

    # X auth
    x_api_key: str
    x_api_secret: str
    x_access_token: str
    x_access_secret: str
    x_bearer_token: str

    # Discord auth
    discord_bot_token: str

    # Links
    website_url: str
    contract_url: str
    discord_invite_url: str

    # Behavior
    dry_run: bool


def load_config() -> Config:
    if load_dotenv:
        load_dotenv()

    def req(name: str) -> str:
        v = os.getenv(name)
        if not v:
            raise RuntimeError(f"Missing env var: {name}")
        return v

    ignore_kw = tuple(
        k.strip().lower()
        for k in os.getenv("IGNORE_IF_CONTAINS_ANY", "airdrop,free money,dm me,whitelist,signal group").split(",")
        if k.strip()
    )
    block_ids = tuple(
        k.strip()
        for k in os.getenv("BLOCKLIST_USER_IDS", "").split(",")
        if k.strip()
    )

    return Config(
        tz_offset_minutes=int(os.getenv("TZ_OFFSET_MINUTES", "0")),
        post_window_start_hour=int(os.getenv("POST_WINDOW_START_HOUR", "10")),
        post_window_end_hour=int(os.getenv("POST_WINDOW_END_HOUR", "20")),
        weekly_long_post_weekday=int(os.getenv("WEEKLY_LONG_POST_WEEKDAY", "2")),
        weekly_long_post_hour=int(os.getenv("WEEKLY_LONG_POST_HOUR", "14")),
        x_poll_seconds=int(os.getenv("X_POLL_SECONDS", "60")),
        discord_channel_id=int(req("DISCORD_CHANNEL_ID")),
        discord_enable_onboarding_autopost=os.getenv("DISCORD_ONBOARDING_AUTOPOST", "true").lower()
        in {"1", "true", "yes"},
        per_user_cooldown_seconds=int(os.getenv("PER_USER_COOLDOWN_SECONDS", "1800")),
        per_user_max_replies_per_day=int(os.getenv("PER_USER_MAX_REPLIES_PER_DAY", "3")),
        ignore_if_contains_any=ignore_kw,
        blocklist_user_ids=block_ids,
        x_api_key=req("X_API_KEY"),
        x_api_secret=req("X_API_SECRET"),
        x_access_token=req("X_ACCESS_TOKEN"),
        x_access_secret=req("X_ACCESS_SECRET"),
        x_bearer_token=req("X_BEARER_TOKEN"),
        discord_bot_token=req("DISCORD_BOT_TOKEN"),
        website_url=os.getenv("WEBSITE_URL", "").strip(),
        contract_url=os.getenv("CONTRACT_URL", "").strip(),
        discord_invite_url=os.getenv("DISCORD_INVITE_URL", "").strip(),
        dry_run=os.getenv("DRY_RUN", "false").lower() in {"1", "true", "yes"},
    )


# -----------------------------
# Storage
# -----------------------------

class Storage:
    def __init__(self, path: str = "vibe_agent.sqlite3") -> None:
        self.conn = sqlite3.connect(path)
        self.conn.row_factory = sqlite3.Row
        self._init()

    def _init(self) -> None:
        cur = self.conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS posted (
              day TEXT NOT NULL,
              platform TEXT NOT NULL,
              kind TEXT NOT NULL,           -- daily | weekly | onboarding
              post_id TEXT NOT NULL,
              text_hash TEXT NOT NULL,
              created_at TEXT NOT NULL,
              PRIMARY KEY (day, platform, kind)
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS replied (
              platform TEXT NOT NULL,
              inbound_id TEXT NOT NULL,
              outbound_id TEXT NOT NULL,
              author_id TEXT NOT NULL,
              created_at TEXT NOT NULL,
              PRIMARY KEY (platform, inbound_id)
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS author_stats (
              day TEXT NOT NULL,
              platform TEXT NOT NULL,
              author_id TEXT NOT NULL,
              replies_count INTEGER NOT NULL,
              last_reply_at TEXT NOT NULL,
              PRIMARY KEY (day, platform, author_id)
            )
            """
        )
        self.conn.commit()

    def posted_today(self, platform: str, kind: str, day: str) -> bool:
        cur = self.conn.cursor()
        cur.execute("SELECT 1 FROM posted WHERE day=? AND platform=? AND kind=?", (day, platform, kind))
        return cur.fetchone() is not None

    def record_post(self, platform: str, kind: str, post_id: str, text: str, day: str) -> None:
        cur = self.conn.cursor()
        cur.execute(
            "INSERT OR IGNORE INTO posted(day, platform, kind, post_id, text_hash, created_at) VALUES(?,?,?,?,?,?)",
            (day, platform, kind, post_id, sha256(text), utc_now_iso()),
        )
        self.conn.commit()

    def was_replied(self, platform: str, inbound_id: str) -> bool:
        cur = self.conn.cursor()
        cur.execute("SELECT 1 FROM replied WHERE platform=? AND inbound_id=?", (platform, inbound_id))
        return cur.fetchone() is not None

    def record_reply(self, platform: str, inbound_id: str, outbound_id: str, author_id: str) -> None:
        cur = self.conn.cursor()
        cur.execute(
            "INSERT OR IGNORE INTO replied(platform, inbound_id, outbound_id, author_id, created_at) VALUES(?,?,?,?,?)",
            (platform, inbound_id, outbound_id, author_id, utc_now_iso()),
        )
        self.conn.commit()

    def get_author_limits(self, day: str, platform: str, author_id: str) -> Tuple[int, Optional[datetime]]:
        cur = self.conn.cursor()
        cur.execute(
            "SELECT replies_count, last_reply_at FROM author_stats WHERE day=? AND platform=? AND author_id=?",
            (day, platform, author_id),
        )
        row = cur.fetchone()
        if not row:
            return 0, None
        last = datetime.fromisoformat(row["last_reply_at"])
        return int(row["replies_count"]), last

    def bump_author_reply(self, day: str, platform: str, author_id: str) -> None:
        cur = self.conn.cursor()
        now = utc_now_iso()
        cur.execute(
            """
            INSERT INTO author_stats(day, platform, author_id, replies_count, last_reply_at)
            VALUES(?,?,?,?,?)
            ON CONFLICT(day, platform, author_id)
            DO UPDATE SET replies_count = replies_count + 1, last_reply_at = excluded.last_reply_at
            """,
            (day, platform, author_id, 1, now),
        )
        self.conn.commit()


# -----------------------------
# Utilities
# -----------------------------

def sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def tz_now(cfg: Config) -> datetime:
    return datetime.now(timezone(timedelta(minutes=cfg.tz_offset_minutes)))

def day_key(cfg: Config, dt: Optional[datetime] = None) -> str:
    d = dt or tz_now(cfg)
    return d.strftime("%Y-%m-%d")


# -----------------------------
# Engagement Router
# -----------------------------

class EngagementRouter:
    """
    Classifies inbound messages and decides:
    - ignore vs reply
    - reply style (short / redirect / normal)
    """

    def __init__(self, cfg: Config, storage: Storage) -> None:
        self.cfg = cfg
        self.storage = storage

    def should_ignore_fast(self, author_id: str, text: str) -> bool:
        if author_id in self.cfg.blocklist_user_ids:
            return True

        low = (text or "").lower()
        if any(k in low for k in self.cfg.ignore_if_contains_any):
            return True

        # obvious spam patterns
        if re.search(r"(airdrop|giveaway|whitelist|dm me|promo|signal group)", low):
            return True

        # excessive links
        if len(re.findall(r"https?://", low)) >= 2:
            return True

        return False

    def allow_reply(self, cfg: Config, platform: str, author_id: str) -> bool:
        now = datetime.now(timezone.utc)
        day = day_key(cfg, tz_now(cfg))
        count, last = self.storage.get_author_limits(day=day, platform=platform, author_id=author_id)

        if count >= cfg.per_user_max_replies_per_day:
            return False

        if last is not None:
            if (now - last).total_seconds() < cfg.per_user_cooldown_seconds:
                return False

        return True

    def classify(self, text: str) -> str:
        low = (text or "").lower()

        if any(n in low for n in ["price", "chart", "target", "roi", "profit", "pump", "moon", "100x", "bag"]):
            return "price_chaser"

        troll_markers = ["scam", "rug", "fraud", "garbage", "shitcoin", "cope", "ponzi", "dead"]
        if any(n in low for n in troll_markers):
            if len(low) < 80 or "?" not in low:
                return "troll"
            return "skeptic"

        curious_markers = ["what is", "explain", "how does", "utility", "use case", "tokenomics", "fees", "burn", "dao"]
        if any(n in low for n in curious_markers):
            return "curious"

        supporter_markers = ["love", "based", "this is it", "finally", "im in", "here for it", "vibes", "agree"]
        if any(n in low for n in supporter_markers):
            return "supporter"

        # default: treat as curious-lite
        return "curious"


# -----------------------------
# Content Engine
# -----------------------------

class ContentEngine:
    CORE_LINE = "VIBE is a coordination experiment, not a financial product."

    CALENDAR_30 = [
        "No roadmap. Just vibes.",
        "Most coins sell certainty. VIBE sells participation.",
        "Culture is the only thing that compounds.",
        "If you’re waiting for utility, you’re missing the point.",
        "Early doesn’t mean cheap. It means undecided.",
        "VIBE isn’t finished. That’s the feature.",
        "You don’t buy culture. You build it.",
        "Roadmaps are just fan fiction with charts.",
        "Speculators ask “when”. Builders ask “what if”.",
        "Fairness beats hype every time.",
        "DAO doesn’t mean democracy. It means responsibility.",
        "Attention is liquidity. Always has been.",
        "The best communities feel small on purpose.",
        "Silence is underrated marketing.",
        "What should VIBE never become?",
        "Culture question: what ruins most crypto communities?",
        "If VIBE works, what would that even look like?",
        "No wrong answers. Just signal.",
        "Influence > returns.",
        "The loudest voices don’t win here.",
        "If you’re here, you already shape it.",
        "VIBE still doesn’t make sense. Good.",
        "Nothing promised. Everything possible.",
        "Culture locked too early becomes cringe.",
        "We move slow on purpose.",
        "The people who stay matter.",
        "If you found this late, it’s still early.",
        "This isn’t mass adoption energy.",
        "VIBE > virality.",
        "Still here. Still undecided. Still alive.",
    ]

    WEEKLY_LONG = (
        "VIBE isn’t here to promise returns, save the world, or replace anything.\n\n"
        "It exists because people want a token that feels human.\n\n"
        "No fake roadmaps.\n"
        "No forced utility.\n"
        "No corporate nonsense.\n\n"
        "Just a community that decides what the vibe becomes.\n\n"
        "Early doesn’t mean profit.\n"
        "Early means influence.\n\n"
        "{core}\n\n"
        "If that clicks, welcome.\n"
        "If it doesn’t, respect."
    )

    TOKENOMICS_INTENT = (
        "We don’t lead with mechanics.\n"
        "We lead with intent.\n\n"
        "Fees exist to sustain, not extract.\n"
        "Time > timing.\n"
        "Voice > whales.\n\n"
        "Fairness first.\n"
        "Everything else follows.\n\n"
        "Not financial advice."
    )

    ONBOARDING_ENTRY = (
        "Welcome to VIBE.\n\n"
        "Nothing is promised here.\n"
        "No one owes you returns.\n\n"
        "If you stay,\n"
        "you help shape what this becomes.\n\n"
        "VIBE is a coordination experiment, not a financial product."
    )

    ONBOARDING_NORMS = (
        "3 cultural norms:\n\n"
        "1) No price talk\n"
        "Not taboo.\n"
        "Just boring.\n\n"
        "2) Taste > volume\n"
        "Good ideas beat loud ones.\n\n"
        "3) Influence is earned\n"
        "Time + contribution > wallets."
    )

    ONBOARDING_FIRST_ACTION = (
        "First question:\n\n"
        "What should VIBE never turn into?\n\n"
        "No polls.\n"
        "No votes.\n"
        "Just answers."
    )

    def __init__(self, website_url: str = "", contract_url: str = "", discord_invite_url: str = "") -> None:
        self.website_url = website_url
        self.contract_url = contract_url
        self.discord_invite_url = discord_invite_url

    def daily_post(self, day_index_1_based: int) -> str:
        idx = max(1, min(30, day_index_1_based)) - 1
        return self._maybe_add_single_link(self.CALENDAR_30[idx])

    def weekly_post(self) -> str:
        return self._maybe_add_single_link(self.WEEKLY_LONG.format(core=self.CORE_LINE))

    def pinned_pitch(self) -> str:
        return self.WEEKLY_LONG.format(core=self.CORE_LINE).strip()

    def onboarding_messages(self) -> list[str]:
        return [
            self._maybe_add_single_link(self.ONBOARDING_ENTRY),
            self._maybe_add_single_link(self.ONBOARDING_NORMS),
            self._maybe_add_single_link(self.ONBOARDING_FIRST_ACTION),
        ]

    # ----- Reply styles (router picks which) -----

    def reply_supporter(self) -> str:
        return random.choice(
            [
                "Quiet agreement.\n\nStay.\nShape it.",
                "Good.\n\nKeep it calm.\nKeep it real.",
                "Taste recognized.\n\nNow add one idea.",
            ]
        )

    def reply_curious(self, inbound_text: str) -> str:
        low = inbound_text.lower()
        if any(k in low for k in ["tokenomics", "fees", "burn", "dao", "allocation", "supply", "tax"]):
            return self._attach_resources(self.TOKENOMICS_INTENT, include_discord=False)
        if any(k in low for k in ["what is", "explain", "utility", "use case", "what does it do"]):
            out = (
                "Ownership.\n"
                "Identity.\n"
                "Participation.\n\n"
                "Culture isn’t decided yet.\n"
                "That’s the point.\n\n"
                + self.CORE_LINE
            )
            return self._attach_resources(out, include_discord=False)

        prompt = random.choice(
            [
                "What should VIBE never become?",
                "What ruins most crypto communities?",
                "If VIBE works, what would that even look like?",
            ]
        )
        return f"{prompt}\n\nShort answer.\nNo performance."

    def reply_skeptic(self) -> str:
        return (
            "Healthy suspicion.\n\n"
            "We underpromise.\n"
            "We over-communicate intent.\n"
            "We let time do the selling.\n\n"
            + self.CORE_LINE
        )

    def reply_price_chaser(self) -> str:
        return (
            "No price predictions.\n"
            "No targets.\n\n"
            "If you’re here,\n"
            "be here for influence.\n"
            "Not promises.\n\n"
            "Not financial advice."
        )

    def reply_troll(self) -> str:
        # Minimal. Do not feed.
        return "Not for you.\nAll good."

    def _maybe_add_single_link(self, text: str) -> str:
        links = [u for u in [self.website_url, self.contract_url] if u]
        if not links:
            return text.strip()
        if "http" in text:
            return text.strip()
        if random.random() < 0.35:
            return f"{text.strip()}\n\n{random.choice(links)}"
        return text.strip()

    def _attach_resources(self, text: str, include_discord: bool) -> str:
        parts = [text.strip()]
        if self.website_url:
            parts.append(self.website_url)
        if self.contract_url:
            parts.append(self.contract_url)
        if include_discord and self.discord_invite_url:
            parts.append(self.discord_invite_url)
        return "\n\n".join([p for p in parts if p]).strip()


# -----------------------------
# X Client
# -----------------------------

class XClient:
    def __init__(self, cfg: Config) -> None:
        self.client_v2 = tweepy.Client(
            bearer_token=cfg.x_bearer_token,
            consumer_key=cfg.x_api_key,
            consumer_secret=cfg.x_api_secret,
            access_token=cfg.x_access_token,
            access_token_secret=cfg.x_access_secret,
            wait_on_rate_limit=True,
        )
        self.dry_run = cfg.dry_run
        self._me_id: Optional[str] = None

    def me_id(self) -> str:
        if self._me_id:
            return self._me_id
        me = self.client_v2.get_me()
        if not me or not me.data:
            raise RuntimeError("Unable to fetch X user (get_me). Check credentials/scopes.")
        self._me_id = str(me.data.id)
        return self._me_id

    def post(self, text: str) -> str:
        if self.dry_run:
            print(f"[DRY_RUN][X POST]\n{text}\n")
            return f"dry_x_{sha256(text)[:10]}"
        res = self.client_v2.create_tweet(text=text)
        if not res or not res.data or "id" not in res.data:
            raise RuntimeError("X post failed (no id). Check app permissions.")
        return str(res.data["id"])

    def reply(self, inbound_tweet_id: str, text: str) -> str:
        if self.dry_run:
            print(f"[DRY_RUN][X REPLY to {inbound_tweet_id}]\n{text}\n")
            return f"dry_xr_{sha256(text)[:10]}"
        res = self.client_v2.create_tweet(text=text, in_reply_to_tweet_id=inbound_tweet_id)
        if not res or not res.data or "id" not in res.data:
            raise RuntimeError("X reply failed (no id).")
        return str(res.data["id"])

    def fetch_mentions(self, since_id: Optional[str] = None, limit: int = 25):
        user_id = self.me_id()
        res = self.client_v2.get_users_mentions(
            id=user_id,
            since_id=since_id,
            max_results=min(limit, 100),
            tweet_fields=["author_id", "conversation_id", "created_at", "in_reply_to_user_id", "text"],
        )
        if not res or not res.data:
            return []
        return res.data


# -----------------------------
# Discord Agent
# -----------------------------

class DiscordAgent(discord.Client):
    def __init__(
        self,
        cfg: Config,
        storage: Storage,
        router: EngagementRouter,
        engine: ContentEngine,
    ) -> None:
        intents = Intents.default()
        intents.message_content = True
        intents.guilds = True
        intents.messages = True
        super().__init__(intents=intents)

        self.cfg = cfg
        self.storage = storage
        self.router = router
        self.engine = engine
        self._ready = asyncio.Event()

    async def on_ready(self) -> None:
        print(f"[Discord] Logged in as {self.user}")
        self._ready.set()

    async def post_to_channel(self, text: str) -> str:
        await self._ready.wait()
        ch = self.get_channel(self.cfg.discord_channel_id)
        if ch is None:
            raise RuntimeError("Discord channel not found. Check DISCORD_CHANNEL_ID and bot permissions.")

        if self.cfg.dry_run:
            print(f"[DRY_RUN][DISCORD POST]\n{text}\n")
            return f"dry_d_{sha256(text)[:10]}"

        msg = await ch.send(text)
        return str(msg.id)

    async def maybe_autopost_onboarding(self, day: str) -> None:
        if not self.cfg.discord_enable_onboarding_autopost:
            return
        if self.storage.posted_today("discord", "onboarding", day):
            return

        msgs = self.engine.onboarding_messages()
        for m in msgs:
            await self.post_to_channel(m)
            await asyncio.sleep(1.2)

        self.storage.record_post(
            "discord",
            "onboarding",
            post_id=f"onboarding_{day}",
            text="\n\n".join(msgs),
            day=day,
        )

    async def on_message(self, message: discord.Message) -> None:
        if message.author == self.user:
            return

        is_dm = isinstance(message.channel, discord.DMChannel)
        is_target_channel = (not is_dm) and (message.channel.id == self.cfg.discord_channel_id)
        if not (is_dm or is_target_channel):
            return

        inbound_id = str(message.id)
        if self.storage.was_replied("discord", inbound_id):
            return

        content = (message.content or "").strip()
        if not content:
            return

        author_id = str(message.author.id)

        if self.router.should_ignore_fast(author_id, content):
            return

        # Only respond if DM, mentioned, or triggered keywords
        mentioned = self.user in message.mentions if self.user else False
        low = content.lower()
        trigger = any(k in low for k in ["vibe", "roadmap", "tokenomics", "buy", "price", "utility", "scam", "rug"])
        if not (is_dm or mentioned or trigger):
            return

        if not self.router.allow_reply(self.cfg, platform="discord", author_id=author_id):
            return

        bucket = self.router.classify(content)
        reply = route_reply(bucket, content, self.engine)

        if self.cfg.dry_run:
            print(f"[DRY_RUN][DISCORD REPLY to {inbound_id} | {bucket}]\n{reply}\n")
            outbound_id = f"dry_dr_{sha256(reply)[:10]}"
        else:
            sent = await message.reply(reply, mention_author=False)
            outbound_id = str(sent.id)

        self.storage.record_reply("discord", inbound_id, outbound_id, author_id=author_id)
        self.storage.bump_author_reply(day=day_key(self.cfg), platform="discord", author_id=author_id)


def route_reply(bucket: str, inbound_text: str, engine: ContentEngine) -> str:
    if bucket == "supporter":
        return engine.reply_supporter()
    if bucket == "curious":
        return engine.reply_curious(inbound_text)
    if bucket == "skeptic":
        return engine.reply_skeptic()
    if bucket == "price_chaser":
        return engine.reply_price_chaser()
    if bucket == "troll":
        return engine.reply_troll()
    return engine.reply_curious(inbound_text)


# -----------------------------
# Scheduling
# -----------------------------

def day_index_from_start(start_date: datetime, now: datetime) -> int:
    delta_days = (now.date() - start_date.date()).days
    return (delta_days % 30) + 1

def pick_daily_time(cfg: Config, day: str) -> datetime:
    rng = random.Random(day)
    start = cfg.post_window_start_hour
    end = max(start + 1, cfg.post_window_end_hour)
    hour = rng.randint(start, end - 1)
    minute = rng.choice([5, 12, 20, 28, 35, 44, 52])
    now = tz_now(cfg)
    return now.replace(hour=hour, minute=minute, second=0, microsecond=0)

def weekly_time(cfg: Config, now: datetime) -> datetime:
    return now.replace(hour=cfg.weekly_long_post_hour, minute=10, second=0, microsecond=0)


# -----------------------------
# Orchestrator
# -----------------------------

class Agent:
    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self.storage = Storage()
        self.router = EngagementRouter(cfg, self.storage)
        self.engine = ContentEngine(cfg.website_url, cfg.contract_url, cfg.discord_invite_url)
        self.x = XClient(cfg)
        self.discord = DiscordAgent(cfg, self.storage, self.router, self.engine)

        self._stop = asyncio.Event()
        self._x_since_id: Optional[str] = None
        self.calendar_start = tz_now(cfg).replace(hour=0, minute=0, second=0, microsecond=0)

    async def start(self) -> None:
        loop = asyncio.get_running_loop()
        for s in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(s, lambda: asyncio.create_task(self.stop()))
            except NotImplementedError:
                pass

        print("\n[PINNED TWEET SUGGESTION]\n")
        print(self.engine.pinned_pitch())
        print("\n---\n")

        discord_task = asyncio.create_task(self.discord.start(self.cfg.discord_bot_token))
        scheduler_task = asyncio.create_task(self.scheduler_loop())
        x_replies_task = asyncio.create_task(self.x_reply_loop())

        await asyncio.wait(
            [discord_task, scheduler_task, x_replies_task],
            return_when=asyncio.FIRST_EXCEPTION,
        )

    async def stop(self) -> None:
        if self._stop.is_set():
            return
        self._stop.set()
        try:
            await self.discord.close()
        except Exception:
            pass

    async def scheduler_loop(self) -> None:
        print("[Agent] Scheduler started")
        last_day = ""
        daily_time: Optional[datetime] = None

        while not self._stop.is_set():
            now = tz_now(self.cfg)
            day = day_key(self.cfg, now)

            if day != last_day:
                daily_time = pick_daily_time(self.cfg, day)
                last_day = day
                print(f"[Agent] Today ({day}) daily post time: {daily_time.strftime('%H:%M')}")
                try:
                    await self.discord.maybe_autopost_onboarding(day)
                except Exception as e:
                    print(f"[Agent] Discord onboarding failed: {e}")

            if daily_time and now >= daily_time:
                await self.post_daily(day=day, now=now)
                daily_time = None

            if now.weekday() == self.cfg.weekly_long_post_weekday:
                wt = weekly_time(self.cfg, now)
                if now >= wt:
                    await self.post_weekly(day=day)

            await asyncio.sleep(10)

    async def post_daily(self, day: str, now: datetime) -> None:
        if self.storage.posted_today("x", "daily", day) and self.storage.posted_today("discord", "daily", day):
            return

        idx = day_index_from_start(self.calendar_start, now)
        text = self.engine.daily_post(idx)

        try:
            if not self.storage.posted_today("x", "daily", day):
                x_id = self.x.post(text)
                self.storage.record_post("x", "daily", x_id, text, day)
                print(f"[Agent] X daily posted: {x_id}")
        except Exception as e:
            print(f"[Agent] X daily post failed: {e}")

        try:
            if not self.storage.posted_today("discord", "daily", day):
                d_id = await self.discord.post_to_channel(text)
                self.storage.record_post("discord", "daily", d_id, text, day)
                print(f"[Agent] Discord daily posted: {d_id}")
        except Exception as e:
            print(f"[Agent] Discord daily post failed: {e}")

    async def post_weekly(self, day: str) -> None:
        if self.storage.posted_today("x", "weekly", day) and self.storage.posted_today("discord", "weekly", day):
            return

        text = self.engine.weekly_post()

        try:
            if not self.storage.posted_today("x", "weekly", day):
                x_id = self.x.post(text)
                self.storage.record_post("x", "weekly", x_id, text, day)
                print(f"[Agent] X weekly posted: {x_id}")
        except Exception as e:
            print(f"[Agent] X weekly post failed: {e}")

        try:
            if not self.storage.posted_today("discord", "weekly", day):
                d_id = await self.discord.post_to_channel(text)
                self.storage.record_post("discord", "weekly", d_id, text, day)
                print(f"[Agent] Discord weekly posted: {d_id}")
        except Exception as e:
            print(f"[Agent] Discord weekly post failed: {e}")

    async def x_reply_loop(self) -> None:
        print("[Agent] X reply loop started")
        while not self._stop.is_set():
            try:
                mentions = self.x.fetch_mentions(since_id=self._x_since_id, limit=25)
                if mentions:
                    self._x_since_id = str(max(int(m.id) for m in mentions))

                for m in mentions:
                    inbound_id = str(m.id)
                    if self.storage.was_replied("x", inbound_id):
                        continue

                    author_id = str(getattr(m, "author_id", "") or "")
                    inbound_text = getattr(m, "text", "") or ""

                    if not author_id:
                        continue

                    if self.router.should_ignore_fast(author_id, inbound_text):
                        continue

                    if not self.router.allow_reply(self.cfg, platform="x", author_id=author_id):
                        continue

                    bucket = self.router.classify(inbound_text)
                    if bucket == "troll":
                        # On X: ignore trolls by default (stronger anti-amplification)
                        continue

                    reply = route_reply(bucket, inbound_text, self.engine).strip()
                    if len(reply) > 260:
                        reply = reply[:257] + "…"

                    out_id = self.x.reply(inbound_id, reply)
                    self.storage.record_reply("x", inbound_id, out_id, author_id=author_id)
                    self.storage.bump_author_reply(day=day_key(self.cfg), platform="x", author_id=author_id)
                    print(f"[Agent] X replied inbound={inbound_id} outbound={out_id} bucket={bucket}")
            except Exception as e:
                print(f"[Agent] X poll/reply error: {e}")

            await asyncio.sleep(self.cfg.x_poll_seconds)


# -----------------------------
# Entry
# -----------------------------

def main() -> None:
    cfg = load_config()
    agent = Agent(cfg)
    asyncio.run(agent.start())


if __name__ == "__main__":
    main()
