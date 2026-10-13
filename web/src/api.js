/** Every call to the KOTSU API goes through here, so a failure always arrives
 *  as an Error carrying what the server actually said — never a silent null
 *  that a screen then renders as "no data". */

async function request(path, { method = "GET", body, signal } = {}) {
  const res = await fetch(path, body === undefined ? { method, signal } : { method, body, signal });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const j = await res.json();
      if (j?.detail) detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {
      /* server sent no JSON; the status line is what we have */
    }
    throw new Error(detail);
  }
  const type = res.headers.get("content-type") || "";
  return type.includes("application/json") ? res.json() : res.text();
}

const form = (obj) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null) fd.append(k, v);
  }
  return fd;
};

export const api = {
  health: () => request("/api/health"),

  listTasks: () => request("/api/tasks"),
  getTask: (id) => request(`/api/tasks/${id}`),
  createTask: (fields) => request("/api/tasks", { method: "POST", body: form(fields) }),

  uploadVideo: (id, role, file) =>
    request(`/api/tasks/${id}/videos/${role}`, { method: "POST", body: form({ file }) }),
  videoUrl: (id, role) => `/api/tasks/${id}/videos/${role}/file`,
  attemptUrl: (id, attemptId) => `/api/tasks/${id}/attempts/${attemptId}/file`,
  audioUrl: (id, knackId, lang) => `/api/tasks/${id}/knacks/${knackId}/audio?lang=${lang}`,
  frameUrl: (id, role, t) => `/api/tasks/${id}/frame?role=${role}&t=${t ?? 0}`,

  analyse: (id, metrics) =>
    request(`/api/tasks/${id}/analyse`, {
      method: "POST",
      body: new Blob([JSON.stringify(metrics ?? {})], { type: "application/json" }),
    }),

  answer: (id, questionId, { text, knackId, audio }) =>
    request(`/api/tasks/${id}/questions/${questionId}/answer`, {
      method: "POST",
      body: form({ text: text ?? "", knack_id: knackId ?? "", audio }),
    }),

  approve: (id, knackId, approved = true) =>
    request(`/api/tasks/${id}/knacks/${knackId}/approve?approved=${approved}`, { method: "POST" }),

  card: (id, knackId, lang) =>
    request(`/api/tasks/${id}/knacks/${knackId}/card?lang=${lang}`, { method: "POST" }),

  addAttempt: (id, fields) =>
    request(`/api/tasks/${id}/attempts`, { method: "POST", body: form(fields) }),

  progress: (id) => request(`/api/tasks/${id}/progress`),
  okf: (id) => request(`/api/tasks/${id}/okf`),
};
