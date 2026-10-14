const ApiServices = (() => {
  const config = {
    tmdbApiKey: "",
    rawgApiKey: "",
    googleBooksApiKey: "",
    ...(window.APP_CONFIG || {})
  };

  const englishFallbacks = new Map([
    ["el senor de los anillos", "the lord of the rings"],
    ["el señor de los anillos", "the lord of the rings"],
    ["la comunidad del anillo", "the fellowship of the ring"],
    ["las dos torres", "the two towers"],
    ["el retorno del rey", "the return of the king"],
    ["harry potter y la piedra filosofal", "harry potter and the philosopher's stone"],
    ["juego de tronos", "game of thrones"],
    ["pokemon", "pokemon"],
    ["pokémon", "pokemon"]
  ]);

  async function loadServerConfig() {
    try {
      const response = await fetch("/api/config");
      if (response.ok) {
        const serverConfig = await response.json();
        config.tmdbApiKey = serverConfig.tmdbApiKey || config.TMDB_API_KEY || config.tmdbApiKey || "";
        config.rawgApiKey = serverConfig.rawgApiKey || config.RAWG_API_KEY || config.rawgApiKey || "";
        config.googleBooksApiKey = serverConfig.googleBooksApiKey || config.GOOGLE_BOOKS_API_KEY || config.googleBooksApiKey || "";
      }
    } catch (error) {
      console.warn("[Registro multimedia] No se pudo leer /api/config. Se usara public/config.js.", error);
      config.tmdbApiKey = config.TMDB_API_KEY || "";
      config.rawgApiKey = config.RAWG_API_KEY || "";
      config.googleBooksApiKey = config.GOOGLE_BOOKS_API_KEY || "";
    }
  }

  function normalizeText(value = "") {
    return String(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function uniqueQueries(query) {
    const normalized = normalizeText(query);
    const candidates = [query.trim(), normalized, englishFallbacks.get(normalized)].filter(Boolean);
    return [...new Set(candidates.map((entry) => entry.trim()).filter(Boolean))];
  }

  function normalizeYear(dateLike) {
    if (!dateLike) return null;
    const year = String(dateLike).slice(0, 4);
    return /^\d{4}$/.test(year) ? Number(year) : null;
  }

  function cover(path, size = "w342") {
    return path ? `https://image.tmdb.org/t/p/${size}${path}` : "";
  }

  function compact(value) {
    return Array.isArray(value) ? value.filter(Boolean).join(", ") : value || "";
  }

  function toItem(raw) {
    return {
      title: raw.title || "",
      original_title: raw.original_title || "",
      category: raw.category,
      status: "pending",
      cover_url: raw.cover_url || "",
      year: raw.year || "",
      description: raw.description || "",
      creator: raw.creator || "",
      genres: raw.genres || "",
      source: raw.source || "",
      external_id: raw.external_id || ""
    };
  }

  function withCategory(items, category) {
    return items.map((item) => ({ ...item, category }));
  }

  async function tmdbFetch(url) {
    const token = String(config.tmdbApiKey || "").trim();
    if (token.startsWith("eyJ")) {
      return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    }
    url.searchParams.set("api_key", token);
    return fetch(url);
  }

  async function searchMovies(query) {
    if (!config.tmdbApiKey || !query) {
      console.warn("[Registro multimedia] Falta TMDB_API_KEY. La busqueda de peliculas queda desactivada.");
      return { items: [], warnings: ["Configura TMDB_API_KEY para buscar películas."] };
    }
    const items = [];
    const warnings = [];
    for (const term of uniqueQueries(query)) {
      const url = new URL("https://api.themoviedb.org/3/search/movie");
      url.searchParams.set("language", "es-MX");
      url.searchParams.set("include_adult", "false");
      url.searchParams.set("query", term);

      try {
        const response = await tmdbFetch(url);
        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          console.error("[Registro multimedia] Error TMDB", response.status, errorText);
          warnings.push("TMDB no respondió correctamente. Revisa la API key.");
          continue;
        }
        const data = await response.json();
        items.push(
          ...(data.results || []).map((movie) =>
            toItem({
              title: movie.title,
              original_title: movie.original_title,
              category: "Película",
              cover_url: cover(movie.poster_path),
              year: normalizeYear(movie.release_date),
              description: movie.overview,
              source: "tmdb",
              external_id: String(movie.id)
            })
          )
        );
      } catch (error) {
        console.error("[Registro multimedia] No se pudo consultar TMDB", error);
        warnings.push("No se pudo conectar con TMDB.");
      }
    }
    return { items: rankItems(items, query).slice(0, 12), warnings };
  }

  async function searchOpenLibrary(query) {
    if (!query) return { items: [], warnings: [] };
    const items = [];
    const warnings = [];
    for (const term of uniqueQueries(query)) {
      const url = new URL("https://openlibrary.org/search.json");
      url.searchParams.set("q", term);
      url.searchParams.set("limit", "8");

      try {
        const response = await fetch(url);
        if (!response.ok) {
          console.error("[Registro multimedia] Error Open Library", response.status);
          warnings.push("Open Library no respondió correctamente.");
          continue;
        }
        const data = await response.json();
        items.push(
          ...(data.docs || []).map((book) =>
            toItem({
              title: book.title,
              original_title: book.title,
              category: "Libro",
              cover_url: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg` : "",
              year: book.first_publish_year || "",
              creator: compact(book.author_name),
              genres: compact(book.subject?.slice(0, 4)),
              source: "openlibrary",
              external_id: book.key
            })
          )
        );
      } catch (error) {
        console.error("[Registro multimedia] No se pudo consultar Open Library", error);
        warnings.push("No se pudo conectar con Open Library.");
      }
    }
    return { items: rankItems(items, query).slice(0, 12), warnings };
  }

  async function searchGoogleBooks(query) {
    if (!query) return { items: [], warnings: [] };
    const items = [];
    const warnings = [];
    for (const term of uniqueQueries(query)) {
      const url = new URL("https://www.googleapis.com/books/v1/volumes");
      url.searchParams.set("q", term);
      url.searchParams.set("maxResults", "8");
      if (config.googleBooksApiKey) url.searchParams.set("key", config.googleBooksApiKey);

      try {
        const response = await fetch(url);
        if (!response.ok) {
          console.error("[Registro multimedia] Error Google Books", response.status);
          warnings.push("Google Books no respondió correctamente.");
          continue;
        }
        const data = await response.json();
        items.push(
          ...(data.items || []).map((entry) => {
            const info = entry.volumeInfo || {};
            return toItem({
              title: info.title,
              original_title: info.title,
              category: "Libro",
              cover_url: info.imageLinks?.thumbnail?.replace("http://", "https://") || "",
              year: normalizeYear(info.publishedDate),
              description: info.description,
              creator: compact(info.authors),
              genres: compact(info.categories),
              source: "googlebooks",
              external_id: entry.id
            });
          })
        );
      } catch (error) {
        console.error("[Registro multimedia] No se pudo consultar Google Books", error);
        warnings.push("No se pudo conectar con Google Books.");
      }
    }
    return { items: rankItems(items, query).slice(0, 12), warnings };
  }

  async function searchGutendex(query) {
    if (!query) return { items: [], warnings: [] };
    const items = [];
    const warnings = [];
    for (const term of uniqueQueries(query)) {
      const url = new URL("https://gutendex.com/books/");
      url.searchParams.set("search", term);

      try {
        const response = await fetch(url);
        if (!response.ok) {
          console.error("[Registro multimedia] Error Gutendex", response.status);
          warnings.push("Gutendex no respondió correctamente.");
          continue;
        }
        const data = await response.json();
        items.push(
          ...(data.results || []).map((book) =>
            toItem({
              title: book.title,
              original_title: book.title,
              category: "Libro",
              cover_url: book.formats?.["image/jpeg"] || "",
              year: "",
              creator: compact((book.authors || []).map((author) => author.name)),
              genres: compact((book.subjects || []).slice(0, 3)),
              source: "gutendex",
              external_id: String(book.id)
            })
          )
        );
      } catch (error) {
        console.error("[Registro multimedia] No se pudo consultar Gutendex", error);
        warnings.push("No se pudo conectar con Gutendex.");
      }
    }
    return { items: rankItems(items, query).slice(0, 12), warnings };
  }

  async function searchGames(query) {
    if (!config.rawgApiKey || !query) {
      console.warn("[Registro multimedia] Falta RAWG_API_KEY. La busqueda de videojuegos queda desactivada.");
      return { items: [], warnings: ["Configura RAWG_API_KEY para buscar videojuegos."] };
    }
    const items = [];
    const warnings = [];
    for (const term of uniqueQueries(query)) {
      const url = new URL("https://api.rawg.io/api/games");
      url.searchParams.set("key", config.rawgApiKey);
      url.searchParams.set("search", term);
      url.searchParams.set("page_size", "12");

      try {
        const response = await fetch(url);
        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          console.error("[Registro multimedia] Error RAWG", response.status, errorText);
          warnings.push("RAWG no respondió correctamente. Revisa la API key.");
          continue;
        }
        const data = await response.json();
        items.push(
          ...(data.results || []).map((game) =>
            toItem({
              title: game.name,
              original_title: game.name,
              category: "Videojuego",
              cover_url: game.background_image,
              year: normalizeYear(game.released),
              description: compact((game.genres || []).map((genre) => genre.name)),
              genres: compact((game.genres || []).map((genre) => genre.name)),
              source: "rawg",
              external_id: String(game.id)
            })
          )
        );
      } catch (error) {
        console.error("[Registro multimedia] No se pudo consultar RAWG", error);
        warnings.push("No se pudo conectar con RAWG.");
      }
    }
    return { items: rankItems(items, query).slice(0, 12), warnings };
  }

  async function searchLocalSource(path, query, label) {
    if (!query) return { items: [], warnings: [] };
    const items = [];
    const warnings = [];

    for (const term of uniqueQueries(query)) {
      const url = new URL(path, window.location.origin);
      url.searchParams.set("q", term);

      try {
        const response = await fetch(url);
        if (!response.ok) {
          console.error(`[Registro multimedia] Error ${label}`, response.status);
          warnings.push(`${label} no respondió correctamente.`);
          continue;
        }
        const data = await response.json();
        items.push(...(data.items || []));
        warnings.push(...(data.warnings || []));
      } catch (error) {
        console.error(`[Registro multimedia] No se pudo consultar ${label}`, error);
        warnings.push(`No se pudo conectar con ${label}.`);
      }
    }

    return { items: rankItems(items, query).slice(0, 12), warnings };
  }

  async function searchComics(query) {
    return searchLocalSource("/api/search/comics", query, "Comic Vine");
  }

  async function searchManga(query) {
    return searchLocalSource("/api/search/manga", query, "AniList");
  }

  function rankItems(items, query) {
    const needle = normalizeText(query);
    return [...items].sort((a, b) => scoreItem(b, needle) - scoreItem(a, needle));
  }

  function scoreItem(item, needle) {
    const title = normalizeText(item.title);
    const original = normalizeText(item.original_title);
    if (title === needle || original === needle) return 100;
    if (title.startsWith(needle) || original.startsWith(needle)) return 80;
    if (title.includes(needle) || original.includes(needle)) return 60;
    return 10;
  }

  function uniqueItems(items) {
    const seen = new Set();
    return items.filter((item) => {
      const key = `${item.source}:${item.external_id || normalizeText(item.title)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function search(query, category) {
    const jobs = [];
    if (category === "Película") jobs.push(searchMovies(query));
    if (category === "Libro") jobs.push(searchOpenLibrary(query), searchGoogleBooks(query), searchGutendex(query));
    if (category === "Cómic") jobs.push(searchComics(query), searchOpenLibrary(query), searchGoogleBooks(query));
    if (category === "Manga") jobs.push(searchManga(query), searchGoogleBooks(query), searchOpenLibrary(query));
    if (category === "Videojuego") jobs.push(searchGames(query));

    const results = await Promise.allSettled(jobs);
    const items = [];
    const warnings = [];
    results.forEach((result) => {
      if (result.status === "fulfilled") {
        items.push(...(result.value.items || []));
        warnings.push(...(result.value.warnings || []));
      } else {
        console.error("[Registro multimedia] Error general de busqueda", result.reason);
        warnings.push("Una fuente de busqueda fallo. Revisa la consola para mas detalles.");
      }
    });
    return { items: uniqueItems(rankItems(withCategory(items, category), query)), warnings: [...new Set(warnings)] };
  }

  return { loadServerConfig, search };
})();
