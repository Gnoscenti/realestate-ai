import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { MLS_OPTIONS } from "@/lib/mls";
import type { OnboardingConflict, OnboardingProfileFields } from "@/lib/onboarding/types";

type Props = {
  profile: OnboardingProfileFields;
  conflicts: OnboardingConflict[];
  onChange: (field: keyof OnboardingProfileFields, value: string | string[]) => void;
  disabled?: boolean;
};
const regions = [
  "Atlanta, GA",
  "Austin, TX",
  "Boston, MA",
  "Chicago, IL",
  "Dallas, TX",
  "Denver, CO",
  "Houston, TX",
  "Las Vegas, NV",
  "Los Angeles, CA",
  "Miami, FL",
  "Nashville, TN",
  "New York, NY",
  "Orlando, FL",
  "Philadelphia, PA",
  "Phoenix, AZ",
  "Portland, OR",
  "Sacramento, CA",
  "San Diego, CA",
  "San Francisco Bay Area, CA",
  "Seattle, WA",
  "Tampa, FL",
  "Washington, DC",
];
const fieldLabels: Partial<Record<keyof OnboardingProfileFields, string>> = {
  name: "Full name",
  brokerage: "Brokerage",
  areaOfOperations: "Market / region",
  phone: "Public phone",
  email: "Public email",
  photoUrl: "Profile photo URL",
  bio: "Biography",
  title: "Professional title",
  agentMlsId: "MLS member/agent ID",
  mls: "MLS / board",
  license: "State license number",
  licenseJurisdiction: "License state / jurisdiction",
  sameAs: "Public social links",
  website: "Real-estate website",
  brokerageBioUrl: "Brokerage biography page",
};

export function OnboardingProfileReview({ profile, conflicts, onChange, disabled = false }: Props) {
  const input = (
    field: keyof OnboardingProfileFields,
    options: {
      required?: boolean;
      list?: string;
      type?: string;
      placeholder?: string;
      autoComplete?: string;
    } = {},
  ) => (
    <div key={field}>
      <Label htmlFor={field === "name" ? "agent-name" : field}>
        {fieldLabels[field] || field}
        {options.required ? "" : " (optional)"}
      </Label>
      <Input
        id={field === "name" ? "agent-name" : field}
        className="mt-1.5 h-11"
        value={typeof profile[field] === "string" ? (profile[field] as string) : ""}
        onChange={(event) => onChange(field, event.target.value)}
        disabled={disabled}
        {...options}
      />
    </div>
  );
  const displayValue = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value.join(", ") : value || "Blank";
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-5">
      {profile.photoUrl && (
        <img
          src={profile.photoUrl}
          referrerPolicy="no-referrer"
          alt={`${profile.name || "Agent"} profile`}
          className="h-20 w-20 rounded-full object-cover"
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {input("name", { required: true, autoComplete: "name" })}
        {input("brokerage", { autoComplete: "organization" })}
        <div className="sm:col-span-2">
          {input("areaOfOperations", {
            list: "onboarding-regions",
            placeholder: "Search a region or enter your service area",
          })}
          <datalist id="onboarding-regions">
            {Array.from(new Set([profile.areaOfOperations, ...regions]))
              .filter(Boolean)
              .map((region) => (
                <option key={region} value={region} />
              ))}
          </datalist>
          <p className="mt-1.5 text-xs text-[var(--color-fg-muted)]">
            Use the market you serve. You can leave this blank until you know.
          </p>
        </div>
      </div>
      {conflicts.length > 0 && (
        <div className="space-y-4 rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
          <div>
            <h3 className="font-medium">Some details differ across sources</h3>
            <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
              Your saved corrections are kept. Choose a different value or edit the field.
            </p>
          </div>
          {conflicts.map((conflict) => (
            <div key={conflict.field} className="space-y-2 text-sm">
              <p className="font-medium">{fieldLabels[conflict.field] || conflict.field}</p>
              <p className="break-words text-xs text-[var(--color-fg-muted)]">
                Using: {displayValue(profile[conflict.field])}
              </p>
              {conflict.values.map((item, index) => (
                <div
                  key={`${item.sourceId}-${index}`}
                  className="flex flex-wrap items-center gap-2"
                >
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 max-w-full whitespace-normal break-words text-left"
                    onClick={() => onChange(conflict.field, item.value)}
                  >
                    Use {displayValue(item.value)}
                  </Button>
                  <a
                    className="text-xs text-[var(--color-primary)] underline underline-offset-2"
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View source
                  </a>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      <details
        className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-4"
        open={!!profile.phone || !!profile.email || !!profile.bio}
      >
        <summary className="min-h-7 cursor-pointer font-medium">
          Contact details and biography
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {input("phone", { type: "tel", autoComplete: "tel" })}
          {input("email", { type: "email", autoComplete: "email" })}
          {input("title")}
          {input("photoUrl", { placeholder: "https://…" })}
          <div className="sm:col-span-2">
            <Label htmlFor="bio">Biography (optional)</Label>
            <Textarea
              id="bio"
              className="mt-1.5"
              rows={4}
              value={profile.bio || ""}
              onChange={(event) => onChange("bio", event.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="public-social-links">Public social links (optional)</Label>
            <Textarea
              id="public-social-links"
              className="mt-1.5"
              rows={2}
              value={(profile.sameAs || []).join("\n")}
              placeholder="One public profile URL per line"
              onChange={(event) => onChange("sameAs", event.target.value.split("\n"))}
            />
          </div>
        </div>
      </details>
      <details
        className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-4"
        open={!!profile.agentMlsId || !!profile.license}
      >
        <summary className="min-h-7 cursor-pointer font-medium">
          MLS member ID and state license (optional)
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {input("agentMlsId", { placeholder: "Your individual member ID" })}
          {profile.agentMlsId && (
            <div>
              {input("mls", {
                list: "onboarding-boards",
                placeholder: "Search or enter your MLS / board",
              })}
              <datalist id="onboarding-boards">
                {MLS_OPTIONS.filter((option) => option.id !== "other").map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </datalist>
            </div>
          )}
          <p className="text-xs leading-relaxed text-[var(--color-fg-muted)] sm:col-span-2">
            Your member ID is different from a listing number or state license. It is saved with
            your MLS / board for supported matching; it does not connect a live MLS feed.
          </p>
          {input("license")}
          {input("licenseJurisdiction", { placeholder: "For example, California" })}
        </div>
      </details>
    </fieldset>
  );
}
