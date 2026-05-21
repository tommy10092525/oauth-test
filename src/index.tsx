import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";

type Bindings = {
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_REDIRECT_URI: string;
  OUR_GUILDS_ID:string
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/", async (c) => {
  const accessToken = getCookie(c, "access_token");
  if (!accessToken) {
    return c.render(
      <>
        <h1>DiscordOAuthテスト</h1>
        <a href="/auth/login">Discordでログインする</a>
      </>,
    );
  } else {
    // ユーザー情報取得
    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const user=await userRes.json() as {avatar:string,id:string}
    const guilds=await guildsRes.json() as {id:string,name:string}[]
    const result=guilds.find(item=>item.id===c.env.OUR_GUILDS_ID)
    return c.render(
      <>
        <h1>DiscordAuthテスト</h1>
        <p>
          <a href="/auth/login">Discordでログインする</a>
          <br />
          <a href="/auth/logout">ログアウト</a>
        </p>
        <h2>ユーザー情報</h2>
        <img src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}`} alt="" />
        <table>
          <tbody>
            {Object.entries(user).map(([key,value])=>{
              return (<tr>
                <th scope="row">{key}</th>
                <td>{JSON.stringify(value)}</td>
              </tr>)
            })}
          </tbody>
        </table>
        <h2>所属</h2>
        {result ? <p>あなたはCODE MATESに所属しています</p>:<h3>あなたはCODE MATESに所属していません</h3>}
        <h3>あなたの所属一覧</h3>
        <ul>
        {guilds.map(guild=><li>{guild.name}</li>)}
        </ul>
      </>,
    );
  }
});

// ① ログインへリダイレクト
app.get("/auth/login", (c) => {
  const DISCORD_CLIENT_ID = c.env.DISCORD_CLIENT_ID!;
  const DISCORD_CLIENT_SECRET = c.env.DISCORD_CLIENT_SECRET!;
  const DISCORD_REDIRECT_URI = c.env.DISCORD_REDIRECT_URI!;
  const state = crypto.randomUUID(); // CSRF対策
  setCookie(c, "oauth_state", state, { httpOnly: true, path: "/" });

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify email guilds",
    state,
  });

  return c.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

// ② コールバック処理
app.get("/auth/callback", async (c) => {
  const DISCORD_CLIENT_ID = c.env.DISCORD_CLIENT_ID!;
  const DISCORD_CLIENT_SECRET = c.env.DISCORD_CLIENT_SECRET!;
  const DISCORD_REDIRECT_URI = c.env.DISCORD_REDIRECT_URI!;
  const { code, state } = c.req.query();
  const savedState = getCookie(c, "oauth_state");

  // stateの検証
  if (!state || state !== savedState) {
    return c.json({ error: "Invalid state" }, 400);
  }

  // アクセストークン取得
  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: DISCORD_REDIRECT_URI,
    }),
  });

  if (!tokenRes.ok) {
    return c.json({ error: "Failed to get token" }, 400);
  }

  const tokenData = (await tokenRes.json()) as { access_token: string };
  const accessToken: string = tokenData.access_token;

  // ユーザー情報取得
  const userRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const user = await userRes.json();

  // セッションやJWTに保存して返す（例: Cookieにセット）
  setCookie(c, "access_token", accessToken, { httpOnly: true, path: "/" });

  // return c.json({ user });
  return c.redirect("/")
});

// ③ ログアウト
app.get("/auth/logout", async (c) => {
  const DISCORD_CLIENT_ID = c.env.DISCORD_CLIENT_ID!;
  const DISCORD_CLIENT_SECRET = c.env.DISCORD_CLIENT_SECRET!;
  const DISCORD_REDIRECT_URI = c.env.DISCORD_REDIRECT_URI!;
  const token = getCookie(c, "access_token");

  if (token) {
    // Discordのトークンを失効させる
    await fetch("https://discord.com/api/oauth2/token/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        token,
      }),
    });
  }

  setCookie(c, "access_token", "", { maxAge: 0, path: "/" });
  return c.redirect("/");
});

export default app;
