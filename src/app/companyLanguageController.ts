import { normalizeLanguage, setCurrentLanguage, type AppLanguage } from "../i18n";

type CompanyLanguageControllerArgs = {
  initialLanguage: string;
  fetchFn?: typeof fetch;
  onPersistenceError?: (error: Error) => void;
};

/** Persists the tenant-wide display language while keeping the active tab responsive. */
export function createCompanyLanguageController(args: CompanyLanguageControllerArgs): {
  changeLanguage(language: AppLanguage): Promise<void>;
} {
  let persistedLanguage = normalizeLanguage(args.initialLanguage);
  const fetchFn = args.fetchFn ?? fetch;

  return {
    async changeLanguage(language: AppLanguage): Promise<void> {
      try {
        const response = await fetchFn("/api/client/profile/language", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ language })
        });
        if (!response.ok) throw new Error(`Company language update failed (${response.status}).`);
        persistedLanguage = language;
      } catch (cause) {
        setCurrentLanguage(persistedLanguage);
        const error = cause instanceof Error ? cause : new Error("Company language update failed.");
        args.onPersistenceError?.(error);
        throw error;
      }
    }
  };
}
