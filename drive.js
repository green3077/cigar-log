// 구글 드라이브 백업 연동 (drive.file 범위 - 앱이 만든 파일에만 접근)
const DriveBackup = (() => {
  const CLIENT_ID = "393782865912-4kpjct9vlspifd1h3321koatdmdpen6d.apps.googleusercontent.com";
  const SCOPE = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email";
  const FOLDER_NAME = "시가다이어리_백업";
  const EVER_SIGNED_IN_KEY = "cigarlog_drive_ever_signed_in";

  // 안드로이드 APK(WebView) 안에서는 구글이 보안상 웹 로그인 스크립트 실행을 막는 경우가 많아,
  // 앱 안에서는 웹용 GIS 대신 안드로이드 네이티브 구글 로그인(Credential Manager) 플러그인을 사용한다.
  const IS_NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

  let tokenClient = null;
  let accessToken = null;
  let tokenExpiresAt = 0;
  let folderId = null;
  let userEmail = null;
  let nativeInitialized = false;

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

  async function ensureNativeInit() {
    if (nativeInitialized) return;
    const { GoogleSignIn } = window.capacitorGoogleSignIn;
    await GoogleSignIn.initialize({ clientId: CLIENT_ID, scopes: SCOPE.split(" ") });
    nativeInitialized = true;
  }

  async function nativeSignIn() {
    await ensureNativeInit();
    const { GoogleSignIn } = window.capacitorGoogleSignIn;
    const result = await GoogleSignIn.signIn();
    if (!result.accessToken) throw new Error("드라이브 접근 권한을 받지 못했습니다.");
    accessToken = result.accessToken;
    // 네이티브 플러그인은 만료 시각을 알려주지 않아, 구글 액세스 토큰의 일반적인 유효 시간(1시간)에
    // 맞춰 보수적으로 55분으로 잡아둔다.
    tokenExpiresAt = Date.now() + 55 * 60 * 1000;
    userEmail = result.email || null;
    return userEmail;
  }

  async function getToken() {
    if (accessToken && Date.now() < tokenExpiresAt) return accessToken;
    if (IS_NATIVE) {
      await nativeSignIn();
      return accessToken;
    }
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
    if (IS_NATIVE) {
      await nativeSignIn();
      localStorage.setItem(EVER_SIGNED_IN_KEY, "1");
      return userEmail;
    }
    await loadGis();
    await requestToken(true);
    await fetchUserEmail();
    localStorage.setItem(EVER_SIGNED_IN_KEY, "1");
    return userEmail;
  }

  // 이전에 로그인한 적이 있으면 팝업 없이 조용히 재인증을 시도한다 (성공/실패를 boolean으로 반환, 에러를 던지지 않음).
  // 브라우저에 구글 로그인 세션이 남아있고 이 앱에 대한 동의가 아직 유효하면 화면 깜빡임 없이 성공한다.
  async function trySilentSignIn() {
    if (localStorage.getItem(EVER_SIGNED_IN_KEY) !== "1") return false;
    try {
      if (IS_NATIVE) {
        await nativeSignIn();
        return true;
      }
      await loadGis();
      await requestToken(false);
      await fetchUserEmail();
      return true;
    } catch (e) {
      return false;
    }
  }

  function signOut() {
    if (IS_NATIVE) {
      if (nativeInitialized) window.capacitorGoogleSignIn.GoogleSignIn.signOut().catch(() => {});
    } else if (accessToken && window.google) {
      google.accounts.oauth2.revoke(accessToken, () => {});
    }
    accessToken = null;
    tokenExpiresAt = 0;
    folderId = null;
    userEmail = null;
    localStorage.removeItem(EVER_SIGNED_IN_KEY);
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

  async function downloadJson(fileId) {
    const res = await apiFetch("https://www.googleapis.com/drive/v3/files/" + fileId + "?alt=media");
    return res.json();
  }

  async function downloadBlob(fileId) {
    const res = await apiFetch("https://www.googleapis.com/drive/v3/files/" + fileId + "?alt=media");
    return res.blob();
  }

  function todayBackupFileName() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return "backup_" + yyyy + "-" + mm + "-" + dd + ".json";
  }

  async function findFileByName(name, parentId) {
    const q = encodeURIComponent("name='" + name + "' and '" + parentId + "' in parents and trashed=false");
    const res = await apiFetch(
      "https://www.googleapis.com/drive/v3/files?q=" + q + "&spaces=drive&fields=files(id,name)"
    );
    const data = await res.json();
    return data.files && data.files[0] ? data.files[0] : null;
  }

  // 이름이 같은 파일이 이미 있으면 내용만 덮어쓰고, 없으면 새로 만든다 (같은 날 여러 번 백업해도 파일이 늘어나지 않게).
  async function upsertJsonFile(name, obj, parentId) {
    const body = JSON.stringify(obj);
    const existing = await findFileByName(name, parentId);
    if (existing) {
      const token = await getToken();
      const res = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files/" + existing.id + "?uploadType=media",
        { method: "PATCH", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body }
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error("Drive 업데이트 실패 (" + res.status + "): " + text);
      }
      return existing.id;
    }
    const uploaded = await uploadFile(name, new Blob([body], { type: "application/json" }), parentId);
    return uploaded.id;
  }

  // 사진은 이미 드라이브에 올라간 적 있으면(entry.photoDriveId / memoPhotos[i].driveId) 건너뛰고,
  // 아직 없는 사진만 새로 업로드한다. 나머지 텍스트 정보(브랜드/특징/피운 장소 등) 전부는
  // backup_YYYY-MM-DD.json 파일 하나에 모아서 저장한다.
  async function backupAll(entries, onProgress) {
    const folder = await ensureFolder();
    const metaList = [];
    const photoUpdates = [];
    let uploadedPhotoCount = 0;
    let i = 0;
    for (const entry of entries) {
      i++;
      let photoDriveId = entry.photoDriveId || null;
      if (!photoDriveId && entry.photo) {
        const uploaded = await uploadFile("entry_" + entry.id + ".jpg", entry.photo, folder);
        photoDriveId = uploaded.id;
        uploadedPhotoCount++;
      }
      const memoPhotos = entry.memoPhotos || [];
      const memoPhotoDriveIds = [];
      for (let mi = 0; mi < memoPhotos.length; mi++) {
        const mp = memoPhotos[mi];
        let driveId = mp.driveId || null;
        if (!driveId && mp.blob) {
          const uploaded = await uploadFile("entry_" + entry.id + "_memo" + mi + ".jpg", mp.blob, folder);
          driveId = uploaded.id;
          uploadedPhotoCount++;
        }
        memoPhotoDriveIds.push(driveId);
      }
      if (photoDriveId !== (entry.photoDriveId || null) || memoPhotoDriveIds.some((id, idx) => id !== (memoPhotos[idx] && memoPhotos[idx].driveId))) {
        photoUpdates.push({
          id: entry.id,
          photoDriveId: photoDriveId,
          memoPhotos: memoPhotos.map((mp, idx) => ({ blob: mp.blob, driveId: memoPhotoDriveIds[idx] })),
        });
      }
      if (onProgress) onProgress({ done: i, total: entries.length });
      const rest = Object.assign({}, entry);
      delete rest.photo;
      delete rest.memoPhotos;
      rest.photoDriveId = photoDriveId;
      rest.memoPhotoDriveIds = memoPhotoDriveIds;
      metaList.push(rest);
    }
    const fileName = todayBackupFileName();
    await upsertJsonFile(fileName, { savedAt: new Date().toISOString(), entries: metaList }, folder);
    return { fileName: fileName, uploadedPhotoCount: uploadedPhotoCount, photoUpdates: photoUpdates };
  }

  async function listBackupFiles() {
    const folder = await ensureFolder();
    const q = encodeURIComponent("'" + folder + "' in parents and trashed=false and name contains 'backup_'");
    const res = await apiFetch(
      "https://www.googleapis.com/drive/v3/files?q=" +
        q +
        "&spaces=drive&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&pageSize=20"
    );
    const data = await res.json();
    return data.files || [];
  }

  // 드라이브에 저장된 백업 파일 중 가장 최근 것을 가져온다.
  async function restoreLatest() {
    const files = await listBackupFiles();
    if (!files.length) return { fileName: null, entries: [] };
    const latest = files[0];
    const data = await downloadJson(latest.id);
    return { fileName: latest.name, entries: (data && data.entries) || [] };
  }

  return {
    signIn,
    trySilentSignIn,
    signOut,
    isSignedIn,
    getUserEmail,
    backupAll,
    listBackupFiles,
    restoreLatest,
    downloadJson,
    downloadBlob,
  };
})();
