/** Vite base with a trailing slash, e.g. `/PersonalLab/`. */
export const BASE_URL: string = import.meta.env.BASE_URL;

/** BrowserRouter `basename`: the base without its trailing slash (`''` at the domain root). */
export const ROUTER_BASENAME: string = BASE_URL.replace(/\/$/, '');