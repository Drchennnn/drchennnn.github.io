const REPOSITORY = "Drchennnn/daily-fragments";
const BRANCH = "main";
const API = "https://api.github.com";
const INDEX_PATH = "index.json";
const JSON_LIMIT = 8 * 1024 * 1024;
const MARKDOWN_LIMIT = 2 * 1024 * 1024;
const PHOTO_LIMIT = 50 * 1024 * 1024;
const encoder = new TextEncoder();
const photoTypes = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export class StorageConflictError extends Error {
  status = 409;
}

function validDate(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === date;
}

function monthDirectory(month) {
  if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("Invalid archive month");
  }
  return month.replace("-", "/");
}

function archiveEntry(value) {
  if (!value || !validDate(value.date) || value.visibility !== "private" ||
      typeof value.title !== "string" || !Array.isArray(value.photos)) {
    throw new Error("Invalid archive index");
  }
  const month = monthDirectory(value.date.slice(0, 7));
  const diaryPrefix = `diary/${month}/`;
  const photoPrefix = `photos/${month}/`;
  if (typeof value.path !== "string" || !value.path.startsWith(diaryPrefix) ||
      !/^[\w-][\w.-]{0,199}\.md$/.test(value.path.slice(diaryPrefix.length))) {
    throw new Error("Invalid archive index");
  }
  const photos = value.photos.map((path) => {
    if (typeof path !== "string" || !path.startsWith(photoPrefix) ||
        !/^[\w-][\w.-]{0,199}\.(jpe?g|png|webp|gif)$/i.test(path.slice(photoPrefix.length))) {
      throw new Error("Invalid archive index");
    }
    return path;
  });
  return {
    date: value.date,
    title: value.title,
    path: value.path,
    photos,
    visibility: "private",
    id: value.path.slice(diaryPrefix.length, -3),
  };
}

async function github(path, env, fetchImpl, { accept = "application/vnd.github+json", body } = {}) {
  if (!env.ARCHIVE_TOKEN) throw new Error("Archive access is unavailable");
  return fetchImpl(`${API}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Accept: accept,
      Authorization: `Bearer ${env.ARCHIVE_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "daily-fragments",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
    redirect: "error",
  });
}

async function readFile(path, env, fetchImpl, ref = BRANCH) {
  const url = `/repos/${REPOSITORY}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
  const response = await github(`${url}?ref=${encodeURIComponent(ref)}`, env, fetchImpl, {
    accept: "application/vnd.github.raw+json",
  });
  if (response.status === 404) return null;
  if (!response.ok || !response.body) throw new Error("Archive read failed");
  return response;
}

function boundedBody(response, limit) {
  if (Number(response.headers.get("Content-Length")) > limit) {
    throw new Error("Archive file exceeds the size limit");
  }
  let total = 0;
  return response.body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      total += chunk.byteLength;
      if (total > limit) throw new Error("Archive file exceeds the size limit");
      controller.enqueue(chunk);
    },
  }));
}

async function readText(path, limit, env, fetchImpl, ref) {
  const response = await readFile(path, env, fetchImpl, ref);
  if (!response) return null;
  return new Response(boundedBody(response, limit)).text();
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid archive JSON");
  }
}

async function indexAt(env, fetchImpl, ref) {
  const data = parseJson(await readText(INDEX_PATH, JSON_LIMIT, env, fetchImpl, ref));
  if (!Array.isArray(data)) throw new Error("Invalid archive index");
  const entries = data.map(archiveEntry);
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) {
    throw new Error("Duplicate archive entry ID");
  }
  return { data, entries };
}

export async function getIndex(env, fetchImpl = fetch) {
  return (await indexAt(env, fetchImpl)).entries;
}

export function markdownBody(markdown) {
  const opening = /^\uFEFF?---[ \t]*\r?\n/.exec(markdown);
  if (!opening) return markdown;
  const rest = markdown.slice(opening[0].length);
  const closing = /^---[ \t]*(?:\r?\n|$)/m.exec(rest);
  return closing ? rest.slice(closing.index + closing[0].length) : markdown;
}

export async function getEntry(entry, env, fetchImpl = fetch) {
  const text = await readText(archiveEntry(entry).path, MARKDOWN_LIMIT, env, fetchImpl);
  if (text === null) throw new Error("Archive entry is missing");
  return markdownBody(text);
}

export async function getPhoto(entry, ordinal, env, fetchImpl = fetch) {
  if (!Number.isSafeInteger(ordinal) || ordinal < 0) return null;
  const path = archiveEntry(entry).photos[ordinal];
  if (!path) return null;
  const response = await readFile(path, env, fetchImpl);
  if (!response) return null;
  return new Response(boundedBody(response, PHOTO_LIMIT), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": photoTypes[path.split(".").at(-1).toLowerCase()],
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function getSummary(month, env, fetchImpl = fetch) {
  monthDirectory(month);
  const text = await readText(`summaries/${month}.md`, MARKDOWN_LIMIT, env, fetchImpl);
  return text === null ? null : markdownBody(text);
}

async function monthAt(month, env, fetchImpl, ref) {
  const directory = monthDirectory(month);
  const text = await readText(`search/${month}.json`, JSON_LIMIT, env, fetchImpl, ref);
  if (text === null) return {};
  const data = parseJson(text);
  const prefix = `diary/${directory}/`;
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      Object.entries(data).some(([path, body]) => !path.startsWith(prefix) ||
        !/^[\w-][\w.-]{0,199}\.md$/.test(path.slice(prefix.length)) || typeof body !== "string")) {
    throw new Error("Invalid archive search index");
  }
  return data;
}

export async function searchMonth(month, env, fetchImpl = fetch) {
  return monthAt(month, env, fetchImpl);
}

async function headOid(env, fetchImpl) {
  const response = await github(`/repos/${REPOSITORY}/git/ref/heads/${BRANCH}`, env, fetchImpl);
  if (!response.ok) throw new Error("Archive branch is unavailable");
  const oid = (await response.json())?.object?.sha;
  if (typeof oid !== "string" || !/^[a-f0-9]{40}$/.test(oid)) {
    throw new Error("Archive has an invalid branch reference");
  }
  return oid;
}

function toBase64(bytes) {
  if (bytes.toBase64) return bytes.toBase64();
  // Use multiples of three so the chunks can be concatenated without interior padding.
  const blockSize = 12 * 1024;
  const parts = [];
  for (let offset = 0; offset < bytes.length; offset += blockSize) {
    parts.push(btoa(String.fromCharCode(...bytes.subarray(offset, offset + blockSize))));
  }
  return parts.join("");
}

async function hash(bytes) {
  return toBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

async function createCommit(expectedHeadOid, additions, env, fetchImpl) {
  const response = await github("/graphql", env, fetchImpl, {
    body: {
      query: `mutation SaveEntry($input: CreateCommitOnBranchInput!) {
        createCommitOnBranch(input: $input) { commit { oid } }
      }`,
      variables: {
        input: {
          branch: { repositoryNameWithOwner: REPOSITORY, branchName: BRANCH },
          message: { headline: "Save private diary entry" },
          expectedHeadOid,
          fileChanges: { additions },
        },
      },
    },
  });
  if (!response.ok) throw new Error("Archive write failed");
  const result = await response.json();
  if (result.errors?.length || !result.data?.createCommitOnBranch?.commit?.oid) {
    throw new Error("Archive write failed");
  }
}

export async function saveEntry(input, env, fetchImpl = fetch) {
  const { date, title, body, nonce, photos } = input;
  if (!validDate(date) || typeof nonce !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(nonce) ||
      typeof title !== "string" || typeof body !== "string" || !Array.isArray(photos)) {
    throw new Error("Invalid diary write input");
  }
  const month = date.slice(0, 7);
  const directory = monthDirectory(month);
  const id = `${date}-${nonce}`;
  const path = `diary/${directory}/${id}.md`;
  const photoPaths = photos.map(({ bytes, extension }, ordinal) => {
    if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > PHOTO_LIMIT ||
        !["jpg", "png", "webp", "gif"].includes(extension)) {
      throw new Error("Invalid diary photo");
    }
    return `photos/${directory}/${id}-${ordinal + 1}.${extension}`;
  });
  const entry = { date, title, path, photos: photoPaths, visibility: "private" };
  const bodyBytes = encoder.encode([
    "---",
    `date: ${date}`,
    `title: ${JSON.stringify(title)}`,
    "visibility: private",
    "---",
    body,
  ].join("\n"));
  if (bodyBytes.length > MARKDOWN_LIMIT) throw new Error("Diary body exceeds the size limit");
  const photoHashes = await Promise.all(photos.map(({ bytes }) => hash(bytes)));
  const writeDigest = await hash(encoder.encode(JSON.stringify([entry, body, photoHashes])));
  const contentFiles = [
    { path, contents: toBase64(bodyBytes) },
    ...photos.map(({ bytes }, ordinal) => ({ path: photoPaths[ordinal], contents: toBase64(bytes) })),
  ];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const oid = await headOid(env, fetchImpl);
    const { data, entries } = await indexAt(env, fetchImpl, oid);
    const existing = entries.findIndex((item) => item.id === id);
    if (existing >= 0) {
      if (data[existing].writeDigest !== writeDigest) {
        throw new StorageConflictError("This save key is already associated with a different entry");
      }
      return entries[existing];
    }
    const monthly = await monthAt(month, env, fetchImpl, oid);
    const indexBytes = encoder.encode(`${JSON.stringify([...data, { ...entry, writeDigest }], null, 2)}\n`);
    const monthBytes = encoder.encode(`${JSON.stringify({ ...monthly, [path]: body })}\n`);
    if (indexBytes.length > JSON_LIMIT || monthBytes.length > JSON_LIMIT) {
      throw new Error("Archive index exceeds the size limit");
    }
    const additions = [
      ...contentFiles,
      { path: INDEX_PATH, contents: toBase64(indexBytes) },
      { path: `search/${month}.json`, contents: toBase64(monthBytes) },
    ];
    try {
      await createCommit(oid, additions, env, fetchImpl);
      return { ...entry, id };
    } catch (error) {
      // A changed head can also mean GitHub accepted the write before a network error.
      // The next attempt checks the existing entry digest before doing another write.
      if (await headOid(env, fetchImpl) === oid) throw error;
    }
  }
  throw new StorageConflictError("Archive changed during the save. Retry using the same save key.");
}
