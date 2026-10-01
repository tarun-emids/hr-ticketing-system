import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CATEGORIES, PRIORITIES } from "../data/users";
import { createTicket, uploadAttachment } from "../data/store";
import { useAuth } from "../context/AuthContext";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB — same cap the backend enforces

const FIELD =
  "w-full border bg-canvas px-3 py-2.5 text-body-lg text-warm placeholder:text-warm/30 focus:border-teal focus:outline-none";
const LABEL = "mb-1.5 block mono-label text-[10px] text-warm/50";

function FieldError({ msg }) {
  if (!msg) return null;
  return (
    <p className="mt-1.5 flex items-start gap-1.5 text-caption text-error">
      <span aria-hidden className="mt-0.5 block h-2 w-2 shrink-0 bg-error" />
      {msg}
    </p>
  );
}

export default function TicketForm() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [category, setCategory] = useState(CATEGORIES[0]);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const e = {};
    if (subject.trim().length < 5) e.subject = "Subject needs at least 5 characters.";
    if (description.trim().length < 20) e.description = "Add a little more detail so HR can help faster (min 20 characters).";
    if (!category) e.category = "Choose a category.";
    if (!priority) e.priority = "Choose a priority.";
    if (file && file.size > MAX_FILE_BYTES) e.attachment = `File is larger than 5 MB (${(file.size / 1024 / 1024).toFixed(1)} MB).`;
    return e;
  };

  const onSubmit = async (ev) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setSubmitting(true);
    try {
      const saved = await createTicket({
        employeeId: user.id,
        category,
        subject: subject.trim(),
        description: description.trim(),
        priority,
      });
      if (file) {
        await uploadAttachment(saved.id, file);
      }
      navigate(`/tickets/${saved.id}?created=1`);
    } catch (err) {
      setErrors({ _form: err.message || "Could not submit the ticket — is the API running?" });
    } finally {
      setSubmitting(false);
    }
  };

  const onPickFile = (ev) => {
    const picked = ev.target.files?.[0] ?? null;
    setFile(picked);
    setErrors((prev) => ({ ...prev, attachment: undefined }));
  };

  return (
    <form onSubmit={onSubmit} noValidate className="soft-bl border border-surface-2 bg-surface p-6 sm:p-8">
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="tf-category" className={LABEL}>Category</label>
          <select id="tf-category" value={category} onChange={(e) => setCategory(e.target.value)} className={FIELD}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <FieldError msg={errors.category} />
        </div>

        <div>
          <label htmlFor="tf-priority" className={LABEL}>Priority</label>
          <select id="tf-priority" value={priority} onChange={(e) => setPriority(e.target.value)} className={FIELD}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <FieldError msg={errors.priority} />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="tf-subject" className={LABEL}>Subject</label>
          <input
            id="tf-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. May payslip is missing the shift allowance"
            className={FIELD}
          />
          <FieldError msg={errors.subject} />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="tf-description" className={LABEL}>Description</label>
          <textarea
            id="tf-description"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what happened, when, and anything HR should know."
            className={`${FIELD} resize-y`}
          />
          <FieldError msg={errors.description} />
          <p className="mt-1.5 mono-label text-[10px] text-warm/30">{description.trim().length} CHARS</p>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="tf-file" className={LABEL}>Attachment · Optional</label>
          {file ? (
            <div className="flex items-center gap-3 border border-teal/40 bg-teal/5 px-3 py-3">
              <svg className="h-4 w-4 shrink-0 text-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m18.4 9.7-6.7 6.7a4 4 0 0 1-5.7-5.7l7.1-7.1a2.6 2.6 0 1 1 3.8 3.6l-6.5 6.5a1.4 1.4 0 0 1-2-2l5.9-6" />
              </svg>
              <span className="min-w-0 flex-1 truncate text-body-lg text-warm">{file.name}</span>
              <span className="mono-label shrink-0 text-[10px] text-warm/40">{(file.size / 1024).toFixed(0)} KB</span>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="mono-label shrink-0 text-[10px] text-error hover:underline"
              >
                Remove
              </button>
            </div>
          ) : (
            <label
              htmlFor="tf-file"
              className="flex cursor-pointer items-center gap-3 border border-dashed border-warm/20 bg-canvas px-3 py-5 text-body text-warm/50 transition-colors hover:border-teal/50 hover:text-warm"
            >
              <svg className="h-4 w-4 text-teal/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 4.5v10m0 0 4-4m-4 4-4-4M4.5 16.5v1.5A2.25 2.25 0 0 0 6.75 20h10.5a2.25 2.25 0 0 0 2.25-2.25V16.5" />
              </svg>
              Click to attach a screenshot or document
            </label>
          )}
          <input id="tf-file" type="file" className="hidden" onChange={onPickFile} />
          <FieldError msg={errors.attachment} />
        </div>
      </div>

      <div className="mt-8 flex items-center justify-end gap-4 border-t border-surface-2 pt-6">
        <button
          type="button"
          onClick={() => navigate("/my-tickets")}
          className="mono-label px-2 py-2 text-[10px] text-warm/50 hover:text-warm"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="mono-label inline-flex items-center gap-2 border border-teal bg-teal px-5 py-3 text-[10px] text-canvas transition-colors hover:bg-teal-light disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Submitting…" : "Submit ticket ↘"}
        </button>
      </div>

      {errors._form && (
        <div className="mt-4 border border-error/40 bg-error/10 px-4 py-3">
          <FieldError msg={errors._form} />
        </div>
      )}
    </form>
  );
}
