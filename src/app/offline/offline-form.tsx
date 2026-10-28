"use client";

import { useActionState, useState } from "react";
import { DownloadButton, SubmitButton } from "@/components/client";
import { inputClass } from "@/components/fields";
import { Notice } from "@/components/ui";
import { offlineActivateAction, type OfflineState } from "./actions";

export function OfflineForm() {
  const [state, action] = useActionState(offlineActivateAction, {} as OfflineState);
  const [request, setRequest] = useState("");
  const [fileError, setFileError] = useState("");

  if (state.ok && state.license && state.fileName) {
    return (
      <div className="mt-8 rounded-xl border border-emerald-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-emerald-800">{state.reused ? "License file issued again" : "Computer activated"}</h2>
        <p className="mt-2 text-sm text-zinc-700">
          <strong>{state.computer}</strong> is licensed to <strong>{state.customer}</strong>.
          {state.reused && " This computer already held the key, so no extra place was used."}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <DownloadButton text={state.license} fileName={state.fileName}>
            Download {state.fileName}
          </DownloadButton>
          <button type="button" className="text-sm text-zinc-600 underline hover:text-zinc-900" onClick={() => window.location.reload()}>
            Activate another computer
          </button>
        </div>
        <p className="mt-4 text-xs text-zinc-500">
          The file works only on that computer. Keep a copy: if Windows is reinstalled, loading it again restores the license.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="mt-8 space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      {state.message && (
        <Notice tone="error" title={state.message}>
          {state.inUse?.length ? (
            <ul className="mt-1 list-disc pl-5">
              {state.inUse.map((item) => (
                <li key={item.computer + item.since}>
                  In use on {item.computer} since {item.since}
                </li>
              ))}
            </ul>
          ) : null}
        </Notice>
      )}
      <div>
        <label htmlFor="request-file" className="mb-1.5 block text-sm font-medium text-zinc-800">
          Activation request file
        </label>
        <input
          id="request-file"
          type="file"
          accept=".txt,.req,text/plain"
          className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-zinc-200"
          onChange={async (event) => {
            setFileError("");
            const file = event.target.files?.[0];
            if (!file) return;
            if (file.size > 16 * 1024) {
              setFileError("This file is too large to be an activation request.");
              return;
            }
            setRequest(await file.text());
          }}
        />
        {fileError && <p className="mt-1.5 text-xs text-red-600">{fileError}</p>}
      </div>
      <div>
        <label htmlFor="request" className="mb-1.5 block text-sm font-medium text-zinc-800">
          Or paste its text
        </label>
        <textarea
          id="request"
          name="request"
          rows={8}
          required
          spellCheck={false}
          value={request}
          onChange={(event) => setRequest(event.target.value)}
          placeholder={"-----BEGIN LICENSE ACTIVATION REQUEST-----\n...\n-----END LICENSE ACTIVATION REQUEST-----"}
          className={`${inputClass()} font-mono text-xs`}
        />
      </div>
      <SubmitButton pendingText="Activating…">Activate</SubmitButton>
    </form>
  );
}
