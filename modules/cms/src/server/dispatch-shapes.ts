const text = (value: unknown) =>
  typeof value === "string" && value.length <= 32768;

const integer = (value: unknown) =>
  Number.isSafeInteger(value) && Number(value) > 0;

const object = (value: unknown) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const optionalObject = (value: unknown) => value === null || object(value);

const bool = (value: unknown) => typeof value === "boolean";

export const cmsShapes: Record<string, ((value: unknown) => boolean)[]> = {
  "cms.bridges": [],
  "cms.access": [text, bool],
  "cms.requests": [text, integer, optionalObject],
  "cms.calendar": [text, optionalObject, integer],
  "cms.canvasList": [text],
  "cms.canvasPage": [text, integer],
  "cms.writeCanvas": [text, object],
  "cms.content": [text, text],
  "cms.saveContent": [text, text, object],
  "cms.shopAccess": [text, text, bool],
  "cms.shop": [text, text, integer, optionalObject],
};
