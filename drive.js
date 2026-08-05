// 구글 드라이브 백업 연동 (drive.file 범위 - 앱이 만든 파일에만 접근)
const DriveBackup = (() => {
  const CLIENT_ID = "393782865912-4kpjct9vlspifd1h3321koatdmdpen6d.apps.googleusercontent.com";
  const SCOPE = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email";
  const FOLDER_NAME = "시가다이어리_백업";

  let tokenClient = null;
  let accessToken = null;
  let tokenExpiresAt = 0;
  let folderId = null;
  let userEmail = null;

  function loadGis() {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) return resolve();
      const existing = document.getElementById("gis-script");
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("Google 로그인 스크립트 로드 실패")));
        return;
      }
      const s = document.createElement("script");
      s.id = "gis-script";
      s.src = "https://accounts.google.com/gsi/client";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Google 로그인 스크립트 로드 실패"));
      document.head.appendChild(s);
    });
  }

  function requestToken(interactive) {
    return new Promise((resolve, reject) => {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        prompt: interactive ? "consent" : "",
        callback: (resp) => {
          if (resp.error) return reject(new Error(resp.error));
          accessToken = resp.access_token;
          tokenExpiresAt = Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000;
          resolve(accessToken);
        },
        error_callback: (err) => reject(new Error(err && err.type ? err.type : "로그인이 취소되었습니다.")),
      });
      tokenClient.requestAccessToken({ prompt: interactive ? "consent" : "" });
    });
  }

  async function getToken() {
    if (accessToken && Date.now() < tokenExpiresAt) return accessToken;
    await loadGis();
    return requestToken(!accessToken);
  }

  async function fetchUserEmail() {
    try {
      const res = await apiFetch("https://www.googleapis.com/oauth2/v3/userinfo");
      const data = await res.json();
      userEmail = data.email || null;
    } catch (e) {
      userEmail = null;
    }
  }

  async function signIn() {
    await loadGis();
    await requestToken(true);
    await fetchUserEmail();
    return userEmail;
  }

  function signOut() {
    if (accessToken && window.google) {
      google.accounts.oauth2.revoke(accessToken, () => {});
    }
    accessToken = null;
    tokenExpiresAt = 0;
    folderId = null;
    userEmail = null;
  }

  function isSignedIn() {
    return !!accessToken && Date.now() < tokenExpiresAt;
  }

  function getUserEmail() {
    return userEmail;
  }

  async function apiFetch(url, opts) {
    opts = opts || {};
    const token = await getToken();
    const headers = Object.assign({}, opts.headers, { Authorization: "Bearer " + token });
    const res = await fetch(url, Object.assign({}, opts, { headers }));
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error("Drive API 오류 (" + res.status + "): " + text);
    }
    return res;
  }

  async function ensureFolder() {
    if (folderId) return folderId;
    const q = encodeURIComponent(
      "name='" + FOLDER_NAME + "' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    );
    const res = await apiFetch(
      "https://www.googleapis.com/drive/v3/files?q=" + q + "&spaces=drive&fields=files(id,name)"
    );
    const data = await res.json();
    if (data.files && data.files.length > 0) {
      folderId = data.files[0].id;
      return folderId;
    }
    const createRes = await apiFetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
    });
    const created = await createRes.json();
    folderId = created.id;
    return folderId;
  }

  async function uploadFile(name, blob, parentId) {
    const token = await getToken();
    const metadata = { name: name, parents: [parentId] };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", blob, name);
    const res = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name",
      { method: "POST", headers: { Authorization: "Bearer " + token }, body: form }
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error("Drive 업로드 실패 (" + res.status + "): " + text);
    }
    return res.json();
  }

  async function backupEntry(entry, photoBlob) {
    const folder = await ensureFolder();
    const base = "entry_" + entry.id;
    let photoDriveId = null;
    if (photoBlob) {
      const uploaded = await uploadFile(base + ".jpg", photoBlob, folder);
      photoDriveId = uploaded.id;
    }
    const meta = Object.assign({}, entry, { photo: undefined, photoDriveId: photoDriveId });
    const metaBlob = new Blob([JSON.stringify(meta)], { type: "application/json" });
    await uploadFile(base + ".json", metaBlob, folder);
    return photoDriveId;
  }

  async function listBackups() {
    const folder = await ensureFolder();
    const q = encodeURIComponent("'" + folder + "' in parents and trashed=false and name contains '.json'");
    const res = await apiFetch(
      "https://www.googleapis.com/drive/v3/files?q=" + q + "&spaces=drive&fields=files(id,name)&pageSize=1000"
    );
    const data = await res.json();
    return data.files || [];
  }

  async function downloadJson(fileId) {
    const res = await apiFetch("https://www.googleapis.com/drive/v3/files/" + fileId + "?alt=media");
    return res.json();
  }

  async function downloadBlob(fileId) {
    const res = await apiFetch("https://www.googleapis.com/drive/v3/files/" + fileId + "?alt=media");
    return res.blob();
  }

  return {
    signIn,
    signOut,
    isSignedIn,
    getUserEmail,
    backupEntry,
    listBackups,
    downloadJson,
    downloadBlob,
  };
})();
