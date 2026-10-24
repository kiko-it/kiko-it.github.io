const COOKIE = "pixel_tidy_progress";

// ブラウザ保存が禁止/満杯でも、Cookieが使えれば同じ保存インターフェースを提供する。
export function browserStorage(browser, document) {
  let local;
  try {
    local = browser.localStorage;
  } catch {
    local = null;
  }
  const readCookie = () => {
    const value = document.cookie
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(COOKIE + "="));
    return value ? decodeURIComponent(value.slice(COOKIE.length + 1)) : null;
  };
  return {
    getItem(key) {
      // 保存容量不足でCookieへ切り替えた後は、古いlocalStorageより新しいCookieを使う。
      try {
        const value = readCookie();
        if (value) {
          JSON.parse(value);
          return value;
        }
      } catch {
        /* 破損Cookieは読み飛ばす。 */
      }
      try {
        const value = local?.getItem(key);
        if (value) return value;
      } catch {
        /* Cookieへ切り替える。 */
      }
      return null;
    },
    setItem(key, value) {
      try {
        if (local) {
          local.setItem(key, value);
          try {
            document.cookie = `${COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
          } catch {
            /* 主保存に成功しているため続行する。 */
          }
          return;
        }
      } catch {
        /* Cookieへ切り替える。 */
      }
      const encoded = encodeURIComponent(value);
      if (encoded.length > 3800)
        throw new Error("Cookieの保存容量を超えています");
      document.cookie = `${COOKIE}=${encoded}; Max-Age=31536000; Path=/; SameSite=Lax`;
      if (readCookie() !== value)
        throw new Error("ブラウザ保存が利用できません");
    },
  };
}
