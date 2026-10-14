import { expect, mock, test } from 'claude-code/testing'

import { detect, follow } from '../hooks/detect'
import { en } from '../hooks/locales/en'
import { makeSpan } from '../hooks/locales/shared'
import { LANGS, LOCALES, MESSAGES, langFrom } from '../hooks/messages'
import type { Lang, Messages, Script } from '../hooks/messages'
import { STILL, cardSvg, dialSvg, historySvg, labelSvg } from '../hooks/views'

type FunctionName = {
  [K in keyof Messages]: Messages[K] extends (...args: never[]) => string ? K : never
}[keyof Messages]
type Samples = {
  [K in FunctionName]: { args: Parameters<Extract<Messages[K], (...args: never[]) => string>>; free?: string[] }[]
}

const COST = '$12.34'
const COUNTS = 'read 2345, wrote 6789'
const WHY = 'reason 2345'
const MODEL = 'model-2345'

// Shared by rendering, argument and width checks so new catalogs face the same examples.
const SAMPLES: Samples = {
  bandWarmDetail: [{ args: ['1.23M', COST], free: [COST] }, { args: ['1.23M', ''] }],
  bandAutoDetail: [{ args: ['1.23M', 23, 200] }],
  bandColdDetail: [{ args: ['1.23M', COST], free: [COST] }, { args: ['1.23M', ''] }],
  expiredAgo: [{ args: ['4:35'] }, { args: ['11.9h'] }],
  coldModel: [{ args: [MODEL], free: [MODEL] }],
  pingCold: [{ args: [WHY, '1.23M'], free: [WHY] }],
  pingApiError: [{ args: ['failure 2345', 503], free: ['failure 2345'] }, { args: ['failure 2345', null], free: ['failure 2345'] }],
  counts: [{ args: [{ read: '234k', wrote: '567k', input: 89, output: 432 }] }],
  atListPrice: [{ args: [COST] }],
  pingHit: [{ args: [COUNTS, COST, '5m'], free: [COUNTS, COST] }, { args: [COUNTS, COST, '1h'], free: [COUNTS, COST] }],
  pingRewrote: [{ args: [COUNTS, COST], free: [COUNTS, COST] }],
  pingMissed: [{ args: [COUNTS, COST], free: [COUNTS, COST] }],
  autoLog: [{ args: [23, 200, 'message 4567'], free: ['message 4567'] }],
  reportWarm: [{ args: ['4:35'] }],
  reportCold: [{ args: [WHY], free: [WHY] }],
  reportTtl: [{ args: ['5m', 'observed'] }, { args: ['1h', 'assumed'] }],
  reportCached: [{ args: ['1.23M', MODEL, 'turn', '4:35'], free: [MODEL] }, { args: ['1.23M', MODEL, 'resume', '11.9h'], free: [MODEL] }],
  reportLapse: [{ args: ['$23.45', COST] }],
  reportPing: [{ args: [COST, true, 200] }, { args: [COST, false, 200] }, { args: [COST, true, 1] }],
  reportPingNone: [{ args: [COST, true] }, { args: [COST, false] }],
  reportRule: [{ args: ['5m', '23.4'] }],
  reportLastPing: [{ args: ['4:35', COUNTS], free: [COUNTS] }],
  reportTouch: [
    { args: ['turn', '4:35', 'ping', '5m', 'hit', '234k', '567k'] },
    { args: ['ping', '11.9h', 'resume', '1h', 'partial', '234k', '567k'] },
    { args: ['turn', '42s', 'turn', '5m', 'miss', '234k', '567k'] },
  ],
  autoWaiting: [{ args: [200] }],
  autoOn: [{ args: [23, 180, 200, '4:35'] }],
  autoOnNone: [{ args: [200] }],
  nextIn: [{ args: ['4:35'] }],
  autoPings: [{ args: ['state 2345'], free: ['state 2345'] }],
  extendsYes: [{ args: ['5m'] }, { args: ['1h'] }],
  extendsUnknown: [{ args: ['5m'] }, { args: ['1h'] }],
  autoUsage: [{ args: [200] }],
  heroLeft: [{ args: ['1.23M'] }],
  heroAuto: [{ args: ['59m', '11.9h'] }, { args: ['', '11.9h'] }, { args: ['4:35', '59m'] }],
  heroCold: [{ args: ['1.23M', COST], free: [COST] }, { args: ['1.23M', ''] }],
  breakEven: [{ args: [200] }, { args: [1] }],
  breakEvenRule: [{ args: [200, '23.4'] }, { args: [1, '23.4'] }],
  autoPlanOff: [{ args: [200, '59m'] }, { args: [200, '11.9h'] }, { args: [200, ''] }, { args: [1, '11.9h'] }],
  autoPlanOn: [{ args: [200, 200] }, { args: [1, 200] }],
  autoTrialOff: [{ args: [200] }],
  autoTrialOn: [{ args: [1, 200] }],
  historyAll: [{ args: [8] }],
  historySome: [{ args: [8, 2] }, { args: [8, 1] }],
  priceNote: [{ args: [COST] }],
  langNow: [
    { args: ['Language 2345', 'pinned'], free: ['Language 2345'] },
    { args: ['Language 2345', 'conversation'], free: ['Language 2345'] },
    { args: ['Language 2345', 'locale'], free: ['Language 2345'] },
    { args: ['Language 2345', 'default'], free: ['Language 2345'] },
  ],
  langUsage: [{ args: [LANGS.join(', ')] }],
}

// No function needs an exception: clock samples retain seconds and history samples use plural counts.
const ARGUMENT_EXCEPTIONS: Partial<Record<FunctionName, string>> = {}

function digits(value: unknown): string[] {
  if (typeof value === 'string' || typeof value === 'number') return String(value).match(/\d+/g) ?? []
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(digits)

  return []
}

function render(m: Messages, name: FunctionName, args: unknown[]): string {
  return (m[name] as (...values: unknown[]) => string)(...args)
}

const ASCII_LOWER = [
  0.54, 0.60, 0.55, 0.60, 0.56, 0.35, 0.60, 0.58, 0.24, 0.24, 0.53, 0.24, 0.86,
  0.57, 0.58, 0.60, 0.60, 0.37, 0.51, 0.35, 0.57, 0.53, 0.76, 0.51, 0.53, 0.53,
]
const ASCII_UPPER = [
  0.66, 0.65, 0.70, 0.72, 0.58, 0.56, 0.74, 0.73, 0.26, 0.53, 0.65, 0.56, 0.86,
  0.73, 0.76, 0.62, 0.76, 0.64, 0.63, 0.62, 0.73, 0.66, 0.96, 0.67, 0.65, 0.65,
]
const ASCII_DIGITS = [0.62, 0.45, 0.59, 0.62, 0.63, 0.61, 0.63, 0.56, 0.63, 0.63]
const ASCII_SIGNS: Record<string, number> = {
  ' ': 0.27, '.': 0.29, ',': 0.29, ':': 0.29, ';': 0.29, "'": 0.29, '/': 0.29,
  '!': 0.30, '?': 0.50, '(': 0.37, ')': 0.37, '[': 0.37, ']': 0.37,
  '-': 0.46, '*': 0.46, '"': 0.47, '|': 0.25, '_': 0.57, '&': 0.70, '%': 0.92, '@': 0.91,
}
const LATIN_LETTERS: Record<string, number> = {
  'ı': 0.24, 'ł': 0.31, 'ƙ': 0.53, 'ð': 0.57, 'ŋ': 0.57, 'ƴ': 0.57, 'ə': 0.57,
  'ø': 0.58, 'þ': 0.60, 'ɓ': 0.60, 'ɗ': 0.60, 'ß': 0.61, 'đ': 0.63, 'æ': 0.89, 'œ': 0.96,
}
const SYMBOLS: Record<string, number> = {
  '·': 0.29, '‘': 0.29, '’': 0.29, '¡': 0.30, '›': 0.44, '“': 0.45, '”': 0.45,
  '¿': 0.50, '–': 0.57, '≈': 0.62, '«': 0.65, '»': 0.65, '…': 0.79, '—': 0.86,
}
const SCRIPT_WIDTHS: readonly (readonly [RegExp, number, number])[] = [
  [/\p{Script=Devanagari}/u, 0.70, 0.25],
  [/\p{Script=Bengali}/u, 0.71, 0.42],
  [/\p{Script=Gujarati}/u, 0.78, 0.24],
  [/\p{Script=Tamil}/u, 0.84, 0.77],
  [/\p{Script=Telugu}/u, 0.95, 0.50],
  [/\p{Script=Kannada}/u, 0.91, 0.55],
  [/\p{Script=Malayalam}/u, 0.89, 0.66],
  [/\p{Script=Thai}/u, 0.62, 0.62],
  [/\p{Script=Ethiopic}/u, 0.86, 0.86],
]

function emOf(char: string): number {
  if (/\p{Mn}/u.test(char)) return 0
  const code = char.codePointAt(0)!
  if (code >= 0x61 && code <= 0x7a) return ASCII_LOWER[code - 0x61]!
  if (code >= 0x41 && code <= 0x5a) return ASCII_UPPER[code - 0x41]!
  if (code >= 0x30 && code <= 0x39) return ASCII_DIGITS[code - 0x30]!
  if (code < 128) return ASCII_SIGNS[char] ?? 0.62
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\uFF01-\uFF60\uFFE0-\uFFE6]/u.test(char)) return 1
  if (/\p{Script=Hangul}/u.test(char)) return 0.87
  if (/\p{Script=Latin}/u.test(char) && /\p{L}/u.test(char)) {
    // Decomposing the whole string would turn a Hangul syllable into several letters.
    const decomposed = char.normalize('NFD')
    if (decomposed !== char) return Array.from(decomposed).reduce((width, part) => width + emOf(part), 0)
    const measured = LATIN_LETTERS[char.toLowerCase()]

    return measured === undefined ? 0.61 : measured + (/\p{Lu}/u.test(char) ? 0.12 : 0)
  }
  if (SYMBOLS[char] !== undefined) return SYMBOLS[char]!
  if (/\p{Sc}/u.test(char)) return 0.62
  const isLetter = /\p{L}/u.test(char)
  const isSpacing = /\p{Mc}/u.test(char)
  if (isLetter && /\p{Script=Cyrillic}/u.test(char)) return /\p{Lu}/u.test(char) ? 0.70 : 0.57
  if (isLetter && /\p{Script=Greek}/u.test(char)) return 0.61
  if (isLetter || isSpacing) {
    const measured = SCRIPT_WIDTHS.find(([script]) => script.test(char))
    if (measured) return measured[isSpacing ? 2 : 1]
  }

  return 0.62
}

function estimateWidth(text: string, px: number): number {
  const em = Array.from(text).reduce((width, char) => width + emOf(char), 0)
  const tracking = px === 12 ? 1.02 : px === 13 ? 1.01 : 1

  return em * px * tracking
}

test('the width estimate agrees with measured UI captions', () => {
  const mismatches: { text: string; measured: number; estimated: number }[] = []
  for (const [text, width] of [
    ['Trial 1/1, up to 200 if it works', 183.7],
    ['None left until next message', 183.8],
    ['refreshes in 47m · up to ~11.9h', 198.3],
    ['先试 1 次，验证后上限 200 次', 187.1],
  ] as const) {
    const estimated = estimateWidth(text, 14)
    // Rounded per-character measurements do not account for kerning.
    if (Math.abs(estimated - width) > 3) {
      mismatches.push({ text, measured: width, estimated: Math.round(estimated * 100) / 100 })
    }
  }
  expect(mismatches).toEqual([])
})

// The fuller breakEvenRule is drawn only when it fits, so it has no fixed room here.
const ROOMS: Partial<Record<keyof Messages, [number, number]>> = {
  heroLeft: [14, 238], heroAuto: [14, 238], heroCold: [14, 238], heroPinging: [14, 238],
  bandCold: [38, 238], bandUnusable: [38, 238],
  autoTitle: [14, 200], autoPlanOff: [14, 200], autoPlanOn: [14, 200],
  autoTrialOff: [14, 200], autoTrialOn: [14, 200], autoSpent: [14, 200], autoNotWorth: [14, 200],
  historyAll: [12, 120], historySome: [12, 120], historyEmpty: [12, 200],
  breakEven: [12, 314], breakEvenNone: [12, 314], priceNote: [12, 314], listPrice: [12, 314],
  rowLapse: [14, 110], rowPing: [14, 110],
  btnOn: [13, 60], btnOff: [13, 60], btnPing: [13, 90], details: [13, 80],
}

test('every registered catalog has the English shape and a distinct name', () => {
  expect(LANGS[0]).toBe('en')
  expect(Object.keys(MESSAGES)).toEqual(LANGS)
  const names: string[] = []
  for (const lang of LANGS) {
    const m = MESSAGES[lang]
    expect(Object.keys(m).sort()).toEqual(Object.keys(en).sort())
    for (const name of Object.keys(en) as (keyof Messages)[]) expect(typeof m[name]).toBe(typeof en[name])
    for (const name of ['name', 'tag', 'fonts'] as const) expect(typeof m[name]).toBe('string')
    expect(m.name.trim().length > 0).toBe(true)
    expect(names.includes(m.name)).toBe(false)
    names.push(m.name)
  }
})

for (const lang of LANGS) {
  test(lang + ' functions render cleanly and keep their arguments', () => {
    const m = MESSAGES[lang]
    const functions = (Object.keys(en) as (keyof Messages)[]).filter(name => typeof en[name] === 'function')
    expect(Object.keys(SAMPLES).sort()).toEqual(functions.sort())
    for (const name of functions as FunctionName[]) {
      for (const sample of SAMPLES[name]) {
        const text = render(m, name, sample.args)
        expect(typeof text).toBe('string')
        expect(text.trim().length > 0).toBe(true)
        for (const bad of ['undefined', 'NaN', '[object', '${']) expect(text).not.toContain(bad)
        if (!ARGUMENT_EXCEPTIONS[name]) {
          for (const run of digits(sample.args)) expect(text).toContain(run)
          for (const free of sample.free ?? []) expect(text).toContain(free)
        }
      }
    }
  })

  test(lang + ' captions fit the room the drawings give them', () => {
    const m = MESSAGES[lang]
    const overflows: { name: keyof Messages; text: string; width: number; room: number }[] = []
    for (const [name, [px, room]] of Object.entries(ROOMS) as [keyof Messages, [number, number]][]) {
      const samples = typeof m[name] === 'function'
        ? SAMPLES[name as FunctionName].map(sample => render(m, name as FunctionName, sample.args))
        : [m[name] as string]
      for (const text of samples) {
        const width = estimateWidth(text, px) * (name === 'autoTitle' ? 1.045 : 1)
        if (width > room) overflows.push({ name, text, width: Math.round(width * 100) / 100, room })
      }
    }
    // Report every overflow together so a future translator can see all captions that need attention.
    expect(overflows).toEqual([])
  })
}

test('language hints recognise registered codes and names without claiming traditional Chinese', () => {
  for (const hint of ['zh_CN.UTF-8', 'zh', 'Chinese', '中文', '简体', ' ZH_cn.utf-8@variant ']) expect(langFrom(hint)).toBe('zh')
  for (const hint of ['en_US.UTF-8', 'en', 'English', ' EN.utf-8@variant ']) expect(langFrom(hint)).toBe('en')
  for (const hint of ['C', 'POSIX', '', 'xx', undefined, null, 42, {}]) expect(langFrom(hint)).toBe(null)
  for (const hint of ['zh_TW', 'zh_HK', 'zh-Hant', 'ZH_hant_TW.UTF-8@variant']) {
    // A later catalog can claim these hints without changing this test.
    expect(langFrom(hint)).toBe(LANGS.find(code => code === ('zh-Hant' as Lang)) ?? null)
  }
  for (const lang of LANGS) {
    expect(langFrom(lang.toUpperCase().replace(/-/g, '_') + '.UTF-8@variant')).toBe(lang)
    expect(langFrom(MESSAGES[lang].name)).toBe(lang)
  }
})

// Every language sample lives here; regional Spanish cannot be inferred from prose.
const DETECTION_SAMPLES = {
  en: [
    'Each request that hits the cache restarts its lifetime, so the countdown starts over after every message you send.',
    'The changes in register.tsx are ready, and they should keep your settings when you restart the app. These checks will show whether the new behavior works with your files.',
  ],
  zh: [
    '新版本已经在跑了：它刚刚记录了你这条消息触发的请求，说明重载后的代码在正常工作。界面我这边看不到，需要你看 register.tsx 和 views.ts 的效果。',
    '我已经检查了配置文件和错误处理流程，并补充了相关测试。现在请求失败时会保留原来的设置，不会覆盖用户的选择。你可以运行测试命令，确认修改后的行为符合预期，再继续检查界面的显示效果。',
  ],
  'zh-Hant': [
    '我已檢查這次修改的邏輯，並補上對應的測試。當請求失敗時，程式會保留原本的設定，不會覆寫使用者的選擇。接下來可以確認介面的顯示結果，再檢查重新啟動後的行為是否符合預期。',
    '這次在 register.tsx 加入了錯誤處理，讓請求中斷時仍能保留原本的設定。測試已涵蓋正常回覆與失敗的情況，你可以先執行測試，再確認面板中的文字與數值是否正確顯示。',
  ],
  ja: [
    '設定を読み込む処理を確認し、失敗した場合のテストを追加しました。リクエストが中断されても、以前の設定はそのまま残ります。次に画面の表示を確認してから、変更を適用してください。',
    'register.tsx の処理を修正し、応答がない場合にも元の設定を保持するようにしました。テストでは正常な応答とエラーの両方を確認しています。再起動した後も同じ動作になるか確認してください。',
  ],
  ko: [
    '설정을 읽는 코드를 확인하고 요청이 실패하는 경우를 테스트에 추가했습니다. 이제 응답이 중단되어도 이전 설정을 유지합니다. 변경 사항을 적용하기 전에 화면에 표시되는 값과 다시 시작한 뒤의 동작을 확인하세요.',
    'register.tsx 파일에서 오류 처리 방식을 수정했습니다. 요청이 실패해도 사용자가 선택한 설정은 그대로 남습니다. 정상 응답과 실패 상황을 모두 테스트했으니 다음으로 패널의 표시와 재시작 후 동작을 확인하세요.',
  ],
  'es-419': [
    'Los cambios ya están listos, pero aún hay que comprobar las respuestas cuando falla una solicitud. La configuración del usuario se conserva y no se modifica hasta que llegue una respuesta válida.',
    'Revisé register.tsx y añadí unas pruebas para los errores. Ahora los ajustes del usuario se conservan aunque no haya respuesta. Puedes ejecutar las pruebas y comprobar que la interfaz muestra el estado correcto.',
  ],
  fr: [
    'Les modifications sont prêtes, mais nous devons encore vérifier les réponses en cas d’échec. La configuration reste intacte et vous pouvez reprendre le travail sans perdre les choix que vous avez faits.',
    'Dans register.tsx, les erreurs sont maintenant traitées sans modifier vos réglages. Vous pouvez lancer les tests pour vérifier ce comportement, puis regarder si les valeurs affichées dans le panneau sont correctes.',
  ],
  de: [
    'Die Änderungen sind fertig, aber die Antworten bei Fehlern müssen noch geprüft werden. Wenn eine Anfrage scheitert, bleibt die bisherige Einstellung erhalten und wird nicht durch einen leeren Wert ersetzt.',
    'In register.tsx wird die Antwort jetzt geprüft, bevor eine Einstellung geändert wird. Die Tests sind ergänzt und zeigen, dass die bisherigen Werte auch dann erhalten bleiben, wenn eine Anfrage ohne Antwort endet.',
  ],
  'pt-BR': [
    'Os ajustes estão prontos, mas ainda precisamos verificar as respostas quando uma solicitação falha. A configuração do usuário não muda, e você pode continuar com suas escolhas sem perder o que já foi definido.',
    'No arquivo register.tsx, os erros são tratados sem alterar suas preferências. Você pode executar os testes para verificar os resultados e também conferir se os valores do painel estão corretos após reiniciar o aplicativo.',
  ],
  it: [
    'Le modifiche sono pronte, quindi possiamo verificare il comportamento della richiesta quando non arriva una risposta. La configurazione degli utenti rimane invariata e il contenuto della schermata può essere controllato prima di procedere.',
    'Il file register.tsx ora conserva le impostazioni della sessione anche quando la richiesta non riesce. I test sono stati aggiunti, quindi puoi verificare che il pannello mostri gli stessi valori dopo il riavvio.',
  ],
  ru: [
    'Изменения готовы, но нужно проверить обработку ошибок при сбое запроса. Прежние настройки сохраняются, поэтому пользователь сможет продолжить работу без повторного выбора параметров после получения ответа.',
    'В register.tsx добавлена проверка ответа перед сохранением настроек. Если запрос завершится ошибкой, прежние значения останутся на месте. Теперь можно запустить тесты и проверить отображение панели после перезапуска.',
  ],
  uk: [
    'Зміни готові, але ще потрібно перевірити обробку помилок під час запиту. Попередні налаштування зберігаються, тому користувач зможе продовжити роботу без повторного вибору параметрів після отримання відповіді.',
    'У register.tsx додано перевірку відповіді перед збереженням налаштувань. Якщо запит завершиться помилкою, попередні значення залишаться на місці. Тепер можна запустити тести й перевірити відображення панелі після перезапуску.',
  ],
  nl: [
    'Ik heb de wijzigingen gecontroleerd en een test toegevoegd voor het geval dat een verzoek mislukt. Je instellingen blijven behouden, zodat je niet opnieuw hoeft te kiezen wanneer je verdergaat.',
    'In register.tsx wordt het antwoord nu gecontroleerd voordat we een instelling opslaan. Ook zonder antwoord blijven jouw eerdere keuzes staan. Je kunt de tests draaien om te zien of dit voor alle bestanden werkt.',
  ],
  sv: [
    'Jag har granskat ändringarna och lagt till några tester. Inställningarna ändras inte när ett svar saknas, eftersom vi bara sparar ett giltigt svar. Du kan också se hur detta fungerar innan du går vidare.',
    'I register.tsx är kontrollen av svaret klar, och inga tidigare val går förlorade. Testerna visar vad som händer utan svar och hur panelen ser ut efter en omstart. Nu kan du även granska dessa ändringar i appen.',
  ],
  da: [
    'Jeg har gennemgået ændringerne og tilføjet nogle test. Der er ikke noget, som overskriver dine indstillinger, selvom et svar mangler. Du kan se, hvad der sker uden et svar, inden du fortsætter med resten af opgaven.',
    'I register.tsx gemmer vi kun et gyldigt svar, uden at ændre nogen af dine tidligere valg. Testene viser dig, hvad der sker ved fejl, så du kan kontrollere nogle af værdierne i panelet, inden du går videre.',
  ],
  nb: [
    'Jeg har gått gjennom endringene og lagt til noen tester. Ingen av de tidligere valgene ble overskrevet, slik at du kan fortsette uten å velge på nytt. Etter testen kan du se hva som skjer dersom et svar mangler.',
    'I register.tsx blir svaret sjekket uten at noen av valgene dine går tapt. Testene viser hva som skjer etter en feil, og bare gyldige svar blir lagret. Dere kan nå sjekke at panelet viser våre verdier slik det skal.',
  ],
  fi: [
    'Tarkistin muutokset ja lisäsin testit, jotka varmistavat asetusten säilymisen. Jos vastausta ei tule, vanhat valinnat eivät muutu. Nyt voit tarkistaa myös näkymän ennen kuin jatkat muihin muutoksiin.',
    'Tiedostossa register.tsx vastaus tarkistetaan ennen asetusten tallennusta. Tämä säilyttää valinnat myös silloin, kun pyyntö epäonnistuu. Testit ovat valmiit, mutta voit vielä katsoa, että paneeli näyttää oikeat arvot.',
  ],
  tr: [
    'Değişiklikleri inceledim ve bir yanıt gelmediğinde önceki ayarların korunması için testler ekledim. Bu sayede istek başarısız olsa bile seçimleriniz değişmez. Ancak devam etmeden önce paneldeki değerleri de kontrol edin.',
    'register.tsx içinde yanıt artık kayıttan önce denetleniyor. Eğer istek başarısız olursa eski ayarlar korunuyor ve boş bir değer yazılmıyor. Testler hazır, ancak bu değişikliğin panelde nasıl göründüğünü de inceleyebilirsiniz.',
  ],
  id: [
    'Saya sudah memeriksa perubahan dan menambahkan pengujian untuk permintaan yang gagal. Jika belum ada balasan, pilihan Anda tidak akan berubah. Anda juga dapat memeriksa tampilan agar nilai yang muncul tetap sesuai.',
    'Di register.tsx, balasan diperiksa sebelum pengaturan disimpan. Dengan ini, pilihan Anda tidak hilang jika permintaan gagal. Pengujian sudah siap, tetapi Anda masih perlu melihat apakah panel menampilkan nilai yang benar.',
  ],
  vi: [
    'Tôi đã kiểm tra các thay đổi và thêm kiểm thử cho trường hợp yêu cầu thất bại. Nếu không có phản hồi thì lựa chọn của bạn vẫn được giữ lại. Bạn có thể xem giao diện trước khi tiếp tục công việc.',
    'Trong register.tsx, phản hồi được kiểm tra trước khi lưu cài đặt. Các giá trị cũ không bị thay thế khi yêu cầu thất bại. Bạn có thể chạy kiểm thử và xem những giá trị này có hiển thị đúng trong bảng hay không.',
  ],
  th: [
    'ตรวจสอบการเปลี่ยนแปลงและเพิ่มการทดสอบกรณีคำขอล้มเหลวแล้ว หากยังไม่มีคำตอบจะเก็บการตั้งค่าเดิมไว้ คุณสามารถตรวจสอบค่าที่แสดงในแผงก่อนทำงานส่วนถัดไปได้',
    'เพิ่มการตรวจสอบคำตอบใน register.tsx ก่อนบันทึกการตั้งค่าแล้ว เมื่อคำขอล้มเหลวจะไม่แทนที่ค่าที่เลือกไว้ คุณสามารถเรียกคำสั่งทดสอบแล้วตรวจสอบว่าแผงแสดงค่าถูกต้องหลังเปิดแอปใหม่หรือไม่',
  ],
  fil: [
    'Sinuri ko ang mga pagbabago at nagdagdag ng pagsusuri para sa mga request na pumapalya. Hindi mababago ang iyong mga pinili kapag walang sagot. Maaari mong tingnan ang panel upang matiyak na tama ang mga halagang ipinapakita.',
    'Sa register.tsx, sinusuri muna ang sagot bago i-save ang mga setting. Hindi mawawala ang iyong mga pinili kung pumalya ang request. Handa na ang mga pagsusuri, kaya maaari mong patakbuhin ang mga ito at tingnan ang panel.',
  ],
  hi: [
    'बदलाव तैयार हैं और मैंने त्रुटियों के लिए जाँच भी जोड़ी है। यदि अनुरोध विफल होता है तो आपकी पुरानी सेटिंग नहीं बदलती। आप परीक्षण चला सकते हैं और देख सकते हैं कि पैनल में सही मान दिख रहे हैं या नहीं।',
    'मैंने register.tsx में जवाब की जाँच जोड़ी है और पुराने मान बनाए रखे हैं। अब अनुरोध विफल होने पर आपकी सेटिंग नहीं बदलती। आप परीक्षण चलाएँ और फिर देखें कि ऐप दोबारा शुरू करने पर भी वही मान दिखते हैं।',
  ],
  bn: [
    'পরিবর্তনগুলো পরীক্ষা করেছি এবং অনুরোধ ব্যর্থ হলে কী হবে তার জন্য পরীক্ষাও যোগ করেছি। উত্তর না এলেও আপনার আগের সেটিং থাকবে। এবার পরীক্ষা চালিয়ে দেখুন প্যানেলে সঠিক মান দেখা যাচ্ছে কি না।',
    'register.tsx ফাইলে সেটিং সংরক্ষণের আগে উত্তর যাচাই করার ব্যবস্থা করেছি। অনুরোধ ব্যর্থ হলে আগের মান বদলাবে না। আপনি পরীক্ষা চালিয়ে তারপর অ্যাপ আবার চালু করে প্যানেলের মানগুলো যাচাই করতে পারেন।',
  ],
  mr: [
    'बदल तयार आहेत आणि विनंती अयशस्वी झाल्यास काय होते याची चाचणी जोडली आहे। उत्तर आले नाही तर आधीची सेटिंग बदलत नाही। तुम्ही चाचण्या चालवा आणि पॅनलमध्ये योग्य मूल्ये दिसत आहेत का ते पाहा।',
    'register.tsx मध्ये उत्तर तपासण्याची सोय केली आहे आणि आधीची मूल्ये तशीच ठेवली आहेत। विनंती अयशस्वी झाली तर तुमची सेटिंग बदलत नाही। चाचण्या चालवल्यानंतर पॅनलमध्ये दिसणारी मूल्ये तपासा आणि पुढील काम करा।',
  ],
  gu: [
    'ફેરફારો તપાસ્યા છે અને વિનંતી નિષ્ફળ જાય ત્યારે શું થાય તેની કસોટી પણ ઉમેરી છે. જવાબ ન મળે તો પણ તમારી પહેલાની સેટિંગ જળવાશે. હવે કસોટીઓ ચલાવીને જુઓ કે પેનલમાં યોગ્ય મૂલ્યો દેખાય છે કે નહીં.',
    'register.tsx માં સેટિંગ સાચવતાં પહેલાં જવાબ તપાસવાની વ્યવસ્થા કરી છે. વિનંતી નિષ્ફળ જાય ત્યારે જૂનાં મૂલ્યો બદલાશે નહીં. તમે કસોટીઓ ચલાવીને પછી ઍપ ફરી શરૂ કરો અને પેનલનાં મૂલ્યો તપાસો.',
  ],
  ta: [
    'மாற்றங்களைச் சரிபார்த்து, கோரிக்கை தோல்வியடைந்தால் என்ன நடக்கும் என்பதற்கான சோதனையையும் சேர்த்துள்ளேன். பதில் வராவிட்டாலும் பழைய அமைப்புகள் மாறாது. சோதனைகளை இயக்கிய பிறகு பேனலில் சரியான மதிப்புகள் காட்டப்படுகின்றனவா எனப் பார்க்கவும்.',
    'register.tsx கோப்பில் அமைப்புகளைச் சேமிக்கும் முன் பதிலைச் சரிபார்க்கும் வசதியைச் சேர்த்துள்ளேன். கோரிக்கை தோல்வியடைந்தால் பழைய மதிப்புகள் மாறாது. சோதனைகளை இயக்கி, செயலியை மீண்டும் தொடங்கிய பிறகும் பேனலில் அதே மதிப்புகள் உள்ளனவா எனப் பார்க்கவும்.',
  ],
  te: [
    'మార్పులను తనిఖీ చేసి, అభ్యర్థన విఫలమైతే ఏం జరుగుతుందో పరీక్షను కూడా జోడించాను. సమాధానం రాకపోయినా మీ పాత సెట్టింగ్‌లు మారవు. ఇప్పుడు పరీక్షలు నడిపి ప్యానెల్‌లో సరైన విలువలు కనిపిస్తున్నాయో చూడండి.',
    'register.tsx ఫైల్‌లో సెట్టింగ్‌లను భద్రపరిచే ముందు సమాధానాన్ని తనిఖీ చేసే విధానాన్ని జోడించాను. అభ్యర్థన విఫలమైతే పాత విలువలు మారవు. పరీక్షలు నడిపిన తర్వాత యాప్‌ను మళ్లీ తెరిచి ప్యానెల్‌లోని విలువలను చూడండి.',
  ],
  kn: [
    'ಬದಲಾವಣೆಗಳನ್ನು ಪರಿಶೀಲಿಸಿ ವಿನಂತಿ ವಿಫಲವಾದಾಗ ಏನಾಗುತ್ತದೆ ಎಂಬ ಪರೀಕ್ಷೆಯನ್ನೂ ಸೇರಿಸಿದ್ದೇನೆ. ಉತ್ತರ ಬರದಿದ್ದರೂ ನಿಮ್ಮ ಹಿಂದಿನ ಸೆಟ್ಟಿಂಗ್‌ಗಳು ಬದಲಾಗುವುದಿಲ್ಲ. ಈಗ ಪರೀಕ್ಷೆಗಳನ್ನು ಚಲಾಯಿಸಿ ಪ್ಯಾನಲ್‌ನಲ್ಲಿ ಸರಿಯಾದ ಮೌಲ್ಯಗಳು ಕಾಣುತ್ತಿವೆಯೇ ಎಂದು ನೋಡಿ.',
    'register.tsx ಕಡತದಲ್ಲಿ ಸೆಟ್ಟಿಂಗ್‌ಗಳನ್ನು ಉಳಿಸುವ ಮುನ್ನ ಉತ್ತರವನ್ನು ಪರಿಶೀಲಿಸುವ ವ್ಯವಸ್ಥೆ ಸೇರಿಸಿದ್ದೇನೆ. ವಿನಂತಿ ವಿಫಲವಾದರೆ ಹಳೆಯ ಮೌಲ್ಯಗಳು ಬದಲಾಗುವುದಿಲ್ಲ. ಪರೀಕ್ಷೆಗಳನ್ನು ಚಲಾಯಿಸಿದ ನಂತರ ಆ್ಯಪ್ ಮತ್ತೆ ತೆರೆದು ಪ್ಯಾನಲ್‌ನ ಮೌಲ್ಯಗಳನ್ನು ಪರಿಶೀಲಿಸಿ.',
  ],
  ml: [
    'മാറ്റങ്ങൾ പരിശോധിക്കുകയും അഭ്യർഥന പരാജയപ്പെടുമ്പോൾ എന്ത് സംഭവിക്കുമെന്ന് പരിശോധിക്കുന്ന പരീക്ഷണം ചേർക്കുകയും ചെയ്തു. മറുപടി വന്നില്ലെങ്കിലും പഴയ ക്രമീകരണങ്ങൾ മാറില്ല. ഇനി പരീക്ഷണങ്ങൾ നടത്തി പാനലിൽ ശരിയായ മൂല്യങ്ങൾ കാണുന്നുണ്ടോ എന്ന് നോക്കുക.',
    'register.tsx ഫയലിൽ ക്രമീകരണങ്ങൾ സൂക്ഷിക്കുന്നതിന് മുമ്പ് മറുപടി പരിശോധിക്കുന്ന സംവിധാനം ചേർത്തു. അഭ്യർഥന പരാജയപ്പെട്ടാൽ പഴയ മൂല്യങ്ങൾ മാറില്ല. പരീക്ഷണങ്ങൾ നടത്തിയ ശേഷം ആപ്പ് വീണ്ടും തുറന്ന് പാനലിലെ മൂല്യങ്ങൾ പരിശോധിക്കുക.',
  ],
  sw: [
    'Nimekagua mabadiliko yako na kuongeza majaribio. Ikiwa ombi halina jibu, mipangilio yako haitabadilika. Unaweza kuangalia matokeo kabla ya kuendelea, lakini bado tunahitaji kuthibitisha kwamba kila kitu kinafanya kazi.',
    'Katika register.tsx, jibu linakaguliwa kabla ya kuhifadhi mipangilio. Hii inaweka chaguo lako bila kupoteza data ikiwa ombi linashindwa. Baada ya majaribio, unaweza pia kuangalia paneli kwenye programu yako.',
  ],
  am: [
    'ለውጦቹን መርምሬ ጥያቄው ሲሳካ እና ሲሳነው የሚፈትሹ ሙከራዎችን ጨምሬያለሁ። ምላሽ ባይኖርም የቀድሞዎቹ ቅንብሮች ይቀመጣሉ። አሁን ሙከራዎቹን አሂደው በማሳያው ላይ ያሉትን እሴቶች ማየት ይችላሉ።',
    'በ register.tsx ውስጥ ቅንብሮችን ከማስቀመጥ በፊት ምላሹን የሚፈትሽ ኮድ ጨምሬያለሁ። ጥያቄው ቢሳነውም የቀድሞዎቹ እሴቶች አይቀየሩም። ሙከራዎቹን ካሄዱ በኋላ መተግበሪያውን እንደገና ከፍተው ውጤቱን ይመልከቱ።',
  ],
  ha: [
    'Na duba canje-canjen kuma na ƙara gwaje-gwaje don buƙatar da ta gaza. Idan babu amsa, wannan ba zai canza zaɓinku ba. Yanzu za ku iya duba sakamakon kafin ku ci gaba da sauran aikin.',
    'A cikin register.tsx, ana duba amsa kafin a adana zaɓi. Idan buƙata ta gaza, waɗannan zaɓuɓɓukan ba za su ɓace ba. Kuma za ku iya gudanar da gwaje-gwajen yanzu don tabbatar da halin da aka samu bayan sake farawa.',
  ],
  ig: [
    'Enyochala m mgbanwe ndị a ma tinye ule maka arịrịọ dara. Ọ bụrụ na enweghị azịza, nhọrọ gị agaghị agbanwe. Ị nwere ike ilele ihe pụtara tupu ịga n’ihu, ka anyị hụ na ihe niile na-arụ ọrụ nke ọma.',
    'Na register.tsx, a na-enyocha azịza tupu echekwa ntọala. Mgbe arịrịọ dara, nhọrọ gị agaghị efu. Ị nwere ike mee ule ndị a ugbu a, hụ ihe pụtara, wee lelee ma panel ọ na-egosi ihe kwesịrị ekwesị.',
  ],
  yo: [
    'Mo ti yẹ àwọn àyípadà wò, mo sì fi ìdánwò kún un fún ìbéèrè tí ó kùnà. Bí ìdáhùn kò bá dé, àwọn àṣàyàn yín kò ní yí padà. Ẹ lè wo èsì náà kí ẹ tó tẹ̀síwájú pẹ̀lú iṣẹ́ tó kàn.',
    'Nínú register.tsx, a ń yẹ ìdáhùn wò kí a tó fi ètò pamọ́. Bí ìbéèrè bá kùnà, àwọn àṣàyàn yín kò ní sọnù. Ẹ lè ṣe àwọn ìdánwò, lẹ́yìn náà ẹ wo bóyá panel fi àwọn iye tó tọ́ hàn.',
  ],
  ny: [
    'Ndaona zosintha ndipo ndawonjezera mayeso ngati pempho lalephera. Ngati palibe yankho, zomwe mwasankha sizisintha. Tsopano inu mutha kuyang’ana zotsatira, komanso kutsimikiza kuti zonse zikugwira ntchito musanapitirire.',
    'Mu register.tsx, yankho limayesedwa tisanayike zokonda. Ngati pempho lalephera, zomwe mwasankha sizitayika. Choncho mutha kuyendetsa mayeso tsopano, koma muyenera kuyang’ana zomwe panel ikuwonetsa pambuyo pake.',
  ],
  om: [
    'Jijjiirama kana ilaalee qorannoo gaaffii hin milkoofneef dabaleera. Yoo deebiin hin jirre filannoon kee hin jijjiiramu. Ati bu’aa kana ilaaluu dandeessa, garuu hojii itti aanu dura sirriitti hojjechuu isaa mirkaneessi.',
    'Faayilii register.tsx keessatti deebiin filannoo kuusuu dura ilaalama. Yoo gaaffiin hin milkoofne filannoon kee hin badu. Kanaaf qorannoo kana jalqabi, booda bu’aa isaa fi waan fuula irratti mul’atu ilaali.',
  ],
  rn: [
    'Naragenzuye ivyahindutse maze nongerako ibipimo. Nimba ata nyishu ibonetse, ivyo mwahisemwo ntibihinduka. Rero murashobora kuraba ivyo bipimo canke kubanza kwemeza ko vyose bikora neza imbere yo kubandanya.',
    'Muri register.tsx, inyishu iragenzurwa imbere yo kubika ivyo mwahisemwo. Nimba gusaba binaniwe, ivyo ntibitakara. Rero murashobora gukoresha ibipimo canke kuraba ico panel yerekana inyuma yo gusubira gutangura.',
  ],
  rw: [
    'Nasuzumye ibyahindutse maze nongeraho ibizamini. Niba nta gisubizo kibonetse, ibyo mwahisemo ntibihinduka. Bityo mushobora kureba ibyo bizamini cyangwa kubanza kwemeza ko byose bikora neza mbere yo gukomeza.',
    'Muri register.tsx, igisubizo gisuzumwa mbere yo kubika ibyo mwahisemo. Niba gusaba byananiranye, ibyo ntibitakara. Bityo mushobora gukoresha ibizamini cyangwa kureba icyo panel yerekana nyuma yo kongera gutangira.',
  ],
  so: [
    'Waxaan eegay isbeddellada waxaana ku daray tijaabooyin codsiga fashilma. Haddii jawaab la waayo, doorashooyinkaagu isma beddelaan. Hadda waxaad eegi kartaa natiijada, laakiin weli waa in la hubiyaa waxa shaashaddu muujinayso.',
    'Faylka register.tsx wuxuu hubiyaa jawaabta ka hor inta aan la kaydin dejinta. Haddii codsigu fashilmo, doorashooyinkaagu ma lumayaan. Waxaad samayn kartaa tijaabooyinka hadda, kadib eeg in dhammaan qiimayaashu sax yihiin.',
  ],
  wo: [
    'Xool naa coppite yi te yokk naa ay seetlu ngir laaj bu antuwul. Bu tontu amul, sa tànneef yi soppeekuwuñu. Léegi nga man a xool njeexital bi bala ngay wéyal liggéey bi, ngir ñu wóor ne lépp di dox.',
    'Ci register.tsx, dañuy seetlu tontu bi bala ñuy denc tànneef yi. Bu laaj bi antuwul, sa tànneef yi duñu réer. Kon nga man a doxal seetlu yi, gannaaw loolu nga xool ndax panel bi wone na lim yi nu war.',
  ],
  bho: [
    'बदलाव तैयार बा आ हमनी गलती वाला हालत के जाँच जोड़ले बानी। जवाब ना आई तबो पुरान सेटिंग ना बदली। रउआ जाँच चला के देखीं कि पैनल में सही मान देखात बा कि ना। ओकर बाद अगिला काम शुरू कइल जा सकेला।',
    'register.tsx में जवाब जाँचे के इंतजाम जोड़ल बा। अनुरोध नाकाम होखे त पुरान मान ना बदली आ रउआ के चुनल सेटिंग ओही तरह रही। हमनी जाँच चला सकेनी आ फेर ऐप खोले के बाद पैनल के मान देख सकेनी।',
  ],
} satisfies Partial<Record<Lang, readonly string[]>>

const ENGLISH = DETECTION_SAMPLES.en[0]!
const CHINESE = DETECTION_SAMPLES.zh[0]!

// Independent review replies: retain the originals even where a wording correction is useful.
const UNIT_FIVE_HELD_OUT_SAMPLES = {
  sw: [
    'Nimesasisha faili ya register.tsx na kuongeza majaribio mapya. Sasa cache ya prompt itaongezwa muda kabla haijaisha, na unaweza kuona hali yake kwenye paneli.',
    'Tatizo lilikuwa kwenye njia ya faili. Nimeirekebisha na kuendesha majaribio yote; yamepita. Ukitaka, naweza pia kuongeza maelezo kwenye README.',
  ],
  ny: ['Ndasintha fayilo ya register.tsx ndipo ndawonjezera mayeso atsopano. Tsopano cache imakhala nthawi yayitali, ndipo mungathe kuona momwe ilili pa gulu.'],
  rw: ['Nahinduye dosiye register.tsx kandi nongeyeho ibizamini bishya. Ubu cache izongererwa igihe mbere y’uko irangira, kandi ushobora kubona uko ihagaze.'],
  rn: ['Nahinduye idosiye register.tsx kandi nongeyeko ibigeragezo bishasha. Ubu cache izokwongererwa igihe imbere y’uko iheza, kandi urashobora kubona uko imeze.'],
  yo: ['Mo ti ṣe àtúnṣe sí fáìlì register.tsx, mo sì fi àwọn ìdánwò tuntun kún un. Báyìí cache náà yóò pẹ́ ju ti tẹ́lẹ̀ lọ, o sì lè rí ipò rẹ̀ nínú pánẹ́ẹ̀lì.'],
  ig: ['Emeela m mgbanwe na faịlụ register.tsx ma tinye ule ọhụrụ. Ugbu a cache ga-adịte aka karịa, ị nwekwara ike ịhụ ọnọdụ ya na panel ahụ.'],
  ha: ['Na sabunta fayil ɗin register.tsx kuma na ƙara sababbin gwaje-gwaje. Yanzu cache zai daɗe fiye da da, kuma za ka iya ganin yanayinsa a cikin allon.'],
  so: ['Waxaan cusboonaysiiyay faylka register.tsx waxaana ku daray tijaabooyin cusub. Hadda cache-ku wuu sii jiri doonaa, waxaadna arki kartaa xaaladdiisa.'],
  om: ['Faayilii register.tsx haaromseera, qormaata haaraas itti dabaleera. Amma cache-n yeroo dheeraaf turuu danda’a, haala isaas paanaalii keessatti arguu dandeessa.'],
  wo: ['Soppi naa fichier bi register.tsx te yokk naa ay test yu bees. Léegi cache bi dina yàgg, te mën nga gis ni mu tollu ci panel bi.'],
} satisfies Partial<Record<Lang, readonly string[]>>

const UNIT_FIVE_REVISED_SAMPLES = {
  sw: ['Nimesasisha faili ya register.tsx na kuongeza majaribio mapya. Sasa cache ya prompt itaongezewa muda kabla haijaisha, na unaweza kuona hali yake kwenye paneli.'],
  ny: ['Ndasintha fayilo ya register.tsx ndipo ndawonjezera mayeso atsopano. Tsopano cache imakhala nthawi yayitali, ndipo mungathe kuona momwe ilili pa panel.'],
  ha: ['Na sabunta fayil ɗin register.tsx kuma na ƙara sababbin gwaje-gwaje. Yanzu cache zai daɗe fiye da a da, kuma za ka iya ganin yanayinsa a cikin allon.'],
  wo: ['Soppi naa fichier register.tsx bi te yokk naa ay test yu bees. Léegi cache bi dina yàgg, te mën nga gis ni mu tollu ci panel bi.'],
} satisfies Partial<Record<Lang, readonly string[]>>

test('unit five held-out and revised replies select their own locale', () => {
  expect(Object.values(UNIT_FIVE_HELD_OUT_SAMPLES).flat().length).toBe(11)
  for (const samples of [UNIT_FIVE_HELD_OUT_SAMPLES, UNIT_FIVE_REVISED_SAMPLES]) {
    for (const [lang, replies] of Object.entries(samples)) {
      for (const reply of replies) {
        expect(detect(reply)?.lang).toBe(lang)
        expect(detect(reply.replace('register.tsx', '`register.tsx`'))?.lang).toBe(lang)
      }
    }
  }
})

test('unit five function words avoid other Latin catalogs except the shared Kirundi and Kinyarwanda forms', () => {
  const latin = LOCALES.filter(locale => locale.script === 'latin' && !('variantOf' in locale))
  for (const locale of latin.filter(locale => UNIT_FIVE.some(code => code === locale.code))) {
    if (!('words' in locale)) continue
    for (const word of locale.words) {
      const owners = latin.filter(other => 'words' in other && other.words.some(candidate => candidate === word)).map(other => other.code)
      if (owners.length > 1) expect(owners).toEqual(['rn', 'rw'])
      // Apostrophe-split English don't and shared African particles are not Igbo/Hausa evidence.
      if (locale.code === 'ig') expect(['na', 'ya', 'ma', 'ka', 'mana', 'maka']).not.toContain(word)
      if (locale.code === 'ha') expect(word).not.toBe('don')
    }
  }
  const shared = 'na ya ma ka ' + 'abcdef'.repeat(10)
  expect(detect(shared)).toBe(null)
  expect(detect("don't don't don't " + 'abcdef'.repeat(10))).toBe(null)
  const dutch = 'Je kunt controleren of de nieuwe instellingen aanwezig zijn, zodat jouw bestanden behouden blijven wanneer een verzoek mislukt.'
  expect(detect(dutch)?.lang).toBe('nl')
})

test('every detection sample belongs only to its own language', () => {
  const detectable = LOCALES.filter(locale => !('variantOf' in locale)).map(locale => locale.code)
  expect(Object.keys(DETECTION_SAMPLES).sort()).toEqual(detectable.sort())
  for (const [lang, samples] of Object.entries(DETECTION_SAMPLES)) {
    expect(samples).toHaveLength(2)
    for (const sample of samples) {
      expect(sample.match(/\p{L}/gu)!.length >= 60).toBe(true)
      expect(detect(sample)?.lang).toBe(lang)
    }
  }
})

const UNIT_THREE = ['nl', 'sv', 'da', 'nb', 'fi', 'tr', 'id', 'vi', 'th', 'fil'] as const

test('unit three samples never select another locale and include a file name', () => {
  for (const lang of UNIT_THREE) {
    expect(DETECTION_SAMPLES[lang].some(sample => sample.includes('register.tsx'))).toBe(true)
    for (const sample of DETECTION_SAMPLES[lang]) {
      const found = detect(sample)
      expect(found?.lang).toBe(lang)
      for (const other of LANGS.filter(code => code !== lang)) expect(found?.lang).not.toBe(other)
    }
  }
})

const UNIT_FOUR = ['hi', 'bn', 'mr', 'gu', 'ta', 'te', 'kn', 'ml', 'bho'] as const

const UNIT_FIVE = ['sw', 'am', 'ha', 'ig', 'yo', 'ny', 'om', 'rn', 'rw', 'so', 'wo'] as const

test('unit five has eleven catalogs, two prose samples each and no wrong-language detections', () => {
  expect(LANGS.length).toBe(43)
  for (const lang of UNIT_FIVE) {
    const m = MESSAGES[lang]
    expect(m.tag).toBe(lang)
    expect(m.fonts).toBe('')
    const samples = DETECTION_SAMPLES[lang]
    expect(samples.length).toBe(2)
    expect(samples.some(sample => sample.includes('register.tsx'))).toBe(true)
    for (const sample of samples) {
      expect((sample.match(/\p{L}/gu) ?? []).length >= 60).toBe(true)
      const found = detect(sample)
      expect(found?.lang).toBe(lang)
      for (const other of LANGS.filter(code => code !== lang)) expect(found?.lang).not.toBe(other)
    }
    const locale = LOCALES.find(locale => locale.code === lang)!
    if ('words' in locale) {
      expect(locale.words.length >= 24).toBe(true)
      expect(new Set(locale.words).size).toBe(locale.words.length)
      for (const word of locale.words) {
        expect(word).toBe(word.toLowerCase())
        expect(word.match(/^\p{L}[\p{L}\p{M}]*$/u)?.[0]).toBe(word)
      }
    }
  }
})

test('African Latin letters decompose for width and retain their detection', () => {
  expect(estimateWidth('ịọụṅẹọṣàáèéìíòóùú', 14)).toBe(estimateWidth('iouneosaaeeiioouu', 14))
  expect(estimateWidth('ɓɗƙƴ', 14)).toBe((0.60 + 0.60 + 0.53 + 0.57) * 14)
  for (const lang of ['ha', 'ig', 'yo'] as const) {
    for (const sample of DETECTION_SAMPLES[lang]) expect(detect(sample.normalize('NFD'))?.lang).toBe(lang)
  }
})

test('related African languages require their distinct forms', () => {
  const shared = 'Ubutumwa bwakiriwe neza kandi gahunda irakora. Ubu ushobora kugenzura umusaruro.'
  expect(detect(shared)).toBe(null)
  expect(detect('ivyo canke nimba ' + shared)?.lang).toBe('rn')
  expect(detect('ibyo cyangwa niba ' + shared)?.lang).toBe('rw')
  expect(detect('ivyo canke nimba ibyo cyangwa niba ' + shared)).toBe(null)
  const prose = 'Mabadiliko yako yamekaguliwa. Zosintha zanu zayesedwa. Mipangilio inaweza kuhifadhiwa.'
  expect(detect('ikiwa lakini kwamba ' + prose)?.lang).toBe('sw')
  expect(detect('ngati koma choncho ' + prose)?.lang).toBe('ny')
})

test('unit four samples never select another locale and include a file name', () => {
  for (const lang of UNIT_FOUR) {
    expect(DETECTION_SAMPLES[lang].some(sample => sample.includes('register.tsx'))).toBe(true)
    for (const sample of DETECTION_SAMPLES[lang]) {
      const found = detect(sample)
      expect(found?.lang).toBe(lang)
      for (const other of LANGS.filter(code => code !== lang)) expect(found?.lang).not.toBe(other)
    }
  }
})

test('Devanagari function words retain vowel signs and match whole words', () => {
  const prose = 'विनंतीचे उत्तर तपासल्यानंतर जुने पर्याय सुरक्षित ठेवण्यासाठी पुढील बदल तयार केले.'
  expect(detect('आहे आणि नाही ' + prose)?.lang).toBe('mr')
  expect(detect('बा बाड़े हमनी ' + prose)?.lang).toBe('bho')
  expect(detect('है हैं नहीं ' + prose)?.lang).toBe('hi')
  expect(detect('चाहे बांधकाम बाड़ेदार हमनीय ' + prose)?.lang).toBe('hi')
  expect(detect('रहे रहे रहे ' + prose)?.lang).toBe('hi')
  expect(detect('आहे आणि नाही बा बाड़े हमनी ' + prose)?.lang).toBe('hi')
  expect(detect(prose)?.lang).toBe('hi')
})

test('Thai marks have no width and Vietnamese diacritics retain Latin widths', () => {
  expect(estimateWidth('กิุ่', 14)).toBe(estimateWidth('ก', 14))
  expect(estimateWidth('ăâêôơưắầệốớự', 14)).toBe(estimateWidth('aaeoouaaeoou', 14))
})

test('new language hints recognise locales, bare codes, English and native names', () => {
  const hints: Partial<Record<Lang, string[]>> = {
    'zh-Hant': ['zh_TW.UTF-8', 'zh_HK', 'zh_MO', 'zh-Hant', 'Traditional Chinese', '繁體中文', '繁体'],
    ja: ['ja_JP.UTF-8', 'ja', 'Japanese', '日本語'],
    ko: ['ko_KR.UTF-8', 'ko', 'Korean', '한국어'],
    es: ['es_ES.UTF-8', 'es', 'Spanish (Spain)', 'Español (España)'],
    'es-419': ['es_MX.UTF-8', 'es_AR', 'es_US', 'es-419', 'Spanish', 'Español', 'Castellano'],
    fr: ['fr_FR.UTF-8', 'fr_CA', 'fr', 'French', 'Français'],
    de: ['de_DE.UTF-8', 'de_AT', 'de_CH', 'de', 'German', 'Deutsch'],
    'pt-BR': ['pt_BR.UTF-8', 'pt_PT', 'pt', 'pt-BR', 'Portuguese', 'Português'],
    it: ['it_IT.UTF-8', 'it', 'Italian', 'Italiano'],
    ru: ['ru_RU.UTF-8', 'ru', 'Russian', 'Русский'],
    uk: ['uk_UA.UTF-8', 'uk', 'Ukrainian', 'Українська'],
    nl: ['nl_NL.UTF-8', 'nl_BE', 'nl', 'Dutch', 'Nederlands'],
    sv: ['sv_SE.UTF-8', 'sv', 'Swedish', 'Svenska'],
    da: ['da_DK.UTF-8', 'da', 'Danish', 'Dansk'],
    nb: ['nb_NO.UTF-8', 'no_NO', 'nn_NO', 'nb', 'no', 'nn', 'Norwegian', 'Norsk', 'Norsk bokmål'],
    fi: ['fi_FI.UTF-8', 'fi', 'Finnish', 'Suomi'],
    tr: ['tr_TR.UTF-8', 'tr', 'Turkish', 'Türkçe'],
    id: ['id_ID.UTF-8', 'in_ID', 'id', 'in', 'Indonesian', 'Bahasa Indonesia'],
    vi: ['vi_VN.UTF-8', 'vi', 'Vietnamese', 'Tiếng Việt'],
    th: ['th_TH.UTF-8', 'th', 'Thai', 'ไทย'],
    fil: ['fil_PH.UTF-8', 'tl_PH', 'fil', 'tl', 'Filipino', 'Tagalog'],
    hi: ['hi_IN.UTF-8', 'hi', 'Hindi', 'हिन्दी', 'हिंदी'],
    bn: ['bn_IN.UTF-8', 'bn_BD', 'bn', 'Bengali', 'Bangla', 'বাংলা'],
    mr: ['mr_IN.UTF-8', 'mr', 'Marathi', 'मराठी'],
    gu: ['gu_IN.UTF-8', 'gu', 'Gujarati', 'ગુજરાતી'],
    ta: ['ta_IN.UTF-8', 'ta', 'Tamil', 'தமிழ்'],
    te: ['te_IN.UTF-8', 'te', 'Telugu', 'తెలుగు'],
    kn: ['kn_IN.UTF-8', 'kn', 'Kannada', 'ಕನ್ನಡ'],
    ml: ['ml_IN.UTF-8', 'ml', 'Malayalam', 'മലയാളം'],
    bho: ['bho_IN.UTF-8', 'bho', 'Bhojpuri', 'भोजपुरी'],
    sw: ['sw_KE.UTF-8', 'sw_TZ', 'sw', 'Swahili', 'Kiswahili'],
    am: ['am_ET.UTF-8', 'am', 'Amharic', 'አማርኛ'],
    ha: ['ha_NG.UTF-8', 'ha', 'Hausa'],
    ig: ['ig_NG.UTF-8', 'ig', 'Igbo'],
    yo: ['yo_NG.UTF-8', 'yo', 'Yoruba', 'Yorùbá'],
    ny: ['ny_MW.UTF-8', 'ny', 'Chichewa', 'Chinyanja', 'Nyanja'],
    om: ['om_ET.UTF-8', 'om', 'Oromo', 'Afaan Oromoo'],
    rn: ['rn_BI.UTF-8', 'rn', 'Kirundi', 'Ikirundi', 'Rundi'],
    rw: ['rw_RW.UTF-8', 'rw', 'Kinyarwanda', 'Ikinyarwanda'],
    so: ['so_SO.UTF-8', 'so', 'Somali', 'Soomaali'],
    wo: ['wo_SN.UTF-8', 'wo', 'Wolof'],
  }
  for (const [lang, samples] of Object.entries(hints)) {
    for (const hint of samples) expect(langFrom(hint)).toBe(lang)
  }
})

test('Spanish replies count toward the variant in force', () => {
  const found = detect(DETECTION_SAMPLES['es-419'][0]!)!
  expect(found.lang).toBe('es-419')
  expect(follow({}, found, 'es')).toEqual({ tally: { es: found.weight }, lang: 'es' })
  expect(follow({}, found, 'en').lang).toBe('es-419')
  expect(follow({ es: 100 }, found, 'es').tally.es).toBe(50 + found.weight)
})

test('Chinese marks distinguish scripts without common Japanese spellings', () => {
  const simplified = LOCALES.find(locale => locale.code === 'zh')!.marks
  const traditional = LOCALES.find(locale => locale.code === 'zh-Hant')!.marks
  for (const marks of [simplified, traditional]) {
    expect(new Set(marks.source.slice(1, -1)).size >= 60).toBe(true)
    for (const char of '国会学校来体点数与写参録設計選連載運進過遠達現線級統組織結終網頁鍵錯針問閉開緩縮複僅並状態額費資優勢輸獲誤則負庫業務層減損剰将軟径営称装還為') {
      expect(marks.test(char)).toBe(false)
    }
  }
  for (const char of simplified.source.slice(1, -1)) expect(traditional.test(char)).toBe(false)
})

test('catalog sentences retain point decimals and translate clock units', () => {
  for (const lang of LANGS) {
    const m = MESSAGES[lang]
    for (const text of [m.reportCached('857k', MODEL, 'turn', '11.9h'), m.heroAuto('52m', '11.9h'), m.autoPlanOff(200, '11.9h')]) {
      expect(text).toContain('11.9')
      expect(text).not.toContain('11,9')
    }
    if (lang === 'en') continue
    for (const text of [m.reportWarm('4:35'), m.nextIn('52m'), m.expiredAgo('42s'), m.pingHit(COUNTS, COST, '5m')]) {
      for (const compact of ['4:35', '52m', '42s', '5m']) expect(text).not.toContain(compact)
    }
  }
})

test('the most recent single hit fits the history caption', () => {
  for (const lang of LANGS) expect(estimateWidth(MESSAGES[lang].historyAll(1), 12) <= 120).toBe(true)
})

for (const lang of ['ja', 'fr', 'nb', 'th', 'hi', 'ta', 'am', 'rn'] as const) {
  test(lang + ' pin changes the cache-status language', async ($, on) => {
    mock.clock(on, { now: 1_700_000_000_000 })
    mock.store(on)
    mock.env(on, { LANG: 'en_US.UTF-8' })
    on('ui.invalidate', () => ({ value: undefined }))
    const pinned = await $.command.run({ command: 'cache-lang', args: lang })
    expect(pinned.text).toBe(MESSAGES[lang].langNow(MESSAGES[lang].name, 'pinned'))
    const status = await $.command.run({ command: 'cache-status', args: '' })
    expect(status.text).toBe(MESSAGES[lang].reportNothing + '\n' + MESSAGES[lang].autoOff)
  })
}

for (const start of ['locale-es', 'pinned-es', 'locale-en'] as const) {
  test('Spanish follows ' + start + ' before any reply was heard', async ($, on) => {
    mock.clock(on, { now: 1_700_000_000_000 })
    mock.store(on, start === 'pinned-es' ? { lang: 'es' } : {})
    mock.env(on, { LANG: start === 'locale-es' ? 'es_ES.UTF-8' : 'en_US.UTF-8' })
    on('ui.invalidate', () => ({ value: undefined }))
    on('turn.step', async function* (_, e) {
      return {
        turnId: e.turnId, index: e.index, answer: DETECTION_SAMPLES['es-419'][0]!, toolUses: [], stopReason: 'end_turn',
        usage: { input_tokens: 12, output_tokens: 300, cache_read_input_tokens: 80_000, cache_creation_input_tokens: 0, model: 'claude-sonnet-5-5' },
      }
    })
    const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet-5-5', messageCount: 1 })
    for await (const _ of step) void _
    await step.result
    const lang = start === 'locale-en' ? 'es-419' : 'es'
    const after = await $.command.run({ command: 'cache-lang', args: start === 'pinned-es' ? 'auto' : '' })
    expect(after.text).toBe(MESSAGES[lang].langNow(MESSAGES[lang].name, 'conversation'))
  })
}

test('detection hears prose, requires evidence for English and bounds its weight', () => {
  expect(detect(ENGLISH)?.lang).toBe('en')
  expect(detect(ENGLISH)?.weight).toBe(ENGLISH.match(/\p{L}/gu)!.length)
  expect(detect(CHINESE)?.lang).toBe('zh')
  expect(detect(CHINESE)?.weight).toBe(CHINESE.match(/\p{L}/gu)!.length)
  for (const prose of ['```ts\n' + ENGLISH + '\n```', '~~~ts\n' + ENGLISH + '\n~~~', '`' + ENGLISH + '`', '``' + ENGLISH + '``', 'ok']) {
    expect(detect(prose)).toBe(null)
  }
  const french = 'Bonjour nous y parlons français avec vous aussi'
  expect(french.match(/\p{L}/gu)!.length).toBe(40)
  expect(detect(french)?.lang ?? null).toBe(LANGS.find(code => code === ('fr' as Lang)) ?? null)
  expect(detect('therein within formation otherwise ' + 'abcdef'.repeat(10))).toBe(null)
  expect(detect('a the ' + 'b'.repeat(50))).toBe(null)
  expect(detect('A THE AND WITH ' + 'b'.repeat(50))?.lang).toBe('en')
  expect(detect('the and with ' + 'b'.repeat(700))?.weight).toBe(600 - 3)
  expect(detect(' '.repeat(600) + ENGLISH)).toBe(null)
  // Unregistered scripts count toward the total without borrowing the Han default.
  if (!LOCALES.some(locale => (locale.script as Script) === 'hangul')) {
    expect(detect('한'.repeat(60))).toBe(null)
    expect(detect('中'.repeat(20) + '한'.repeat(40))).toBe(null)
  }
  expect(detect('中'.repeat(20) + 'filename'.repeat(10))?.lang).toBe('zh')
  expect(detect('中'.repeat(19) + 'filename'.repeat(10))).toBe(null)
  expect(detect('中'.repeat(20) + 'filename'.repeat(20))).toBe(null)
})

test('following decays every score and requires a sustained English lead', () => {
  const original = { zh: 100, en: 0, other: 30 }
  const first = follow(original, { lang: 'en', weight: 100 }, 'zh')
  expect(first).toEqual({ tally: { zh: 50, en: 100, other: 15 }, lang: 'zh' })
  expect(original).toEqual({ zh: 100, en: 0, other: 30 })
  const second = follow(first.tally, { lang: 'en', weight: 100 }, first.lang)
  expect(second.lang).toBe('en')
  expect(follow({ en: 100 }, { lang: 'zh', weight: 100 }, 'en').lang).toBe('zh')
  expect(follow({}, { lang: 'en', weight: 100 }, undefined).lang).toBe('en')
  expect(follow({ zh: 100 }, { lang: 'en', weight: 149 }, 'zh').lang).toBe('zh')
  expect(follow({ zh: 100 }, { lang: 'en', weight: 150 }, 'zh').lang).toBe('en')
  const chinese = follow({}, detect(CHINESE)!, undefined)
  const once = follow(chinese.tally, detect(ENGLISH)!, chinese.lang)
  expect(once.lang).toBe('zh')
  expect(follow(once.tally, detect(ENGLISH)!, once.lang).lang).toBe('en')
})

test('span words retain the Chinese clock and allow other punctuation', () => {
  const chinese = makeSpan({ units: { s: '秒', m: '分钟', h: '小时' }, clockMinute: '分' })
  for (const [compact, words] of [['52m', '52 分钟'], ['1.5h', '1.5 小时'], ['42s', '42 秒'], ['4:35', '4 分 35 秒'], ['3:00', '3 分钟'], ['4:05', '4 分 5 秒'], ['expired', 'expired']]) {
    expect(chinese(compact!)).toBe(words)
  }
  const compact = makeSpan({ units: { s: 'sec', m: 'min', h: 'h' }, join: ' et ', space: false, decimal: ',' })
  expect(compact('11.9h')).toBe('11,9h')
  expect(compact('4:35')).toBe('4min et 35sec')
  expect(compact('3:00')).toBe('3min')
  expect(MESSAGES.zh.reportWarm('3:00')).toBe('提示缓存：有效，剩余 3 分钟。')
})

test('unit-first spans keep decimals, clock seconds and the other formatting options', () => {
  const swahili = makeSpan({ units: { s: 'sekunde', m: 'dakika', h: 'saa' }, unitFirst: true })
  for (const [compact, words] of [
    ['52m', 'dakika 52'], ['1.5h', 'saa 1.5'], ['42s', 'sekunde 42'],
    ['4:35', 'dakika 4 sekunde 35'], ['3:00', 'dakika 3'], ['4:05', 'dakika 4 sekunde 5'],
    ['expired', 'expired'], ['', ''],
  ]) expect(swahili(compact!)).toBe(words)
  const compact = makeSpan({
    units: { s: 'sekunde', m: 'dakika', h: 'saa' }, clockMinute: 'dak',
    join: ' na ', space: false, decimal: ',', unitFirst: true,
  })
  expect(compact('11.9h')).toBe('saa11,9')
  expect(compact('4:05')).toBe('dak4 na sekunde5')
  expect(compact('3:00')).toBe('dakika3')
})

test('unit five catalogs put each duration and clock in their own counting order', () => {
  const spans = {
    sw: ['saa 1.5', 'dak 4 sek 35', 'dak 3', 'sek 42'],
    am: ['1.5 ሰዓ', '4 ደቂ 35 ሰከ', '3 ደቂ', '42 ሰከ'],
    ha: ['h 1.5', 'min 4 s 35', 'min 3', 's 42'],
    ig: ['h 1.5', 'min 4 s 35', 'min 3', 's 42'],
    yo: ['h 1.5', 'min 4 s 35', 'min 3', 's 42'],
    ny: ['h 1.5', 'min 4 s 35', 'min 3', 's 42'],
    om: ['sa’a 1.5', 'daq 4 s 35', 'daq 3', 's 42'],
    rn: ['h 1.5', 'min 4 s 35', 'min 3', 's 42'],
    rw: ['h 1.5', 'min 4 s 35', 'min 3', 's 42'],
    so: ['1.5 saac', '4 daq 35 s', '3 daq', '42 s'],
    wo: ['1.5 h', '4 min 35 s', '3 min', '42 s'],
  }
  for (const lang of UNIT_FIVE) {
    const m = MESSAGES[lang]
    expect(m.reportWarm('1.5h')).toContain(spans[lang][0]!)
    expect(m.reportWarm('4:35')).toContain(spans[lang][1]!)
    expect(m.nextIn('3:00')).toContain(spans[lang][2]!)
    expect(m.expiredAgo('42s')).toContain(spans[lang][3]!)
  }
})

test('all drawing entry points default to English and carry each catalog language and fonts', () => {
  const card = { figure: '52m', caption: 'caption', left: 0.8, isCold: false, isClosing: false, mark: null, motion: STILL, costs: null }
  const defaults = [dialSvg(0.8, false, false), cardSvg(card).source, labelSvg('caption', 200, 'body').source, historySvg(['hit'], 'summary').source]
  for (const source of defaults) {
    expect(source).toContain('lang="en"')
    expect(source).toContain('font-family:system-ui, -apple-system, sans-serif')
  }
  for (const lang of LANGS) {
    const m = MESSAGES[lang]
    const drawings = [dialSvg(0.8, false, false, STILL, m), cardSvg({ ...card, locale: m }).source, labelSvg('caption', 200, 'body', m).source, historySvg(['hit'], 'summary', m).source]
    for (const source of drawings) {
      expect(source).toContain('lang="' + m.tag + '"')
      expect(source).toContain('font-family:system-ui, -apple-system' + (m.fonts ? ', ' + m.fonts : '') + ', sans-serif')
    }
  }
})

for (const lang of LANGS) {
  test(lang + ' command accepts hints and lists registered codes for an unknown language', { timeoutMs: 30_000 }, async ($, on) => {
    mock.clock(on, { now: 1_700_000_000_000 })
    mock.store(on, { lang })
    on('ui.invalidate', () => ({ value: undefined }))
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    let argumentHint = ''
    on('command.register', (_, e) => {
      if (e.name === 'cache-lang') argumentHint = e.argumentHint ?? ''

      return { value: { command: e.name } }
    })
    await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
    expect(argumentHint).toBe(MESSAGES[lang].cmdLangHint)
    const usage = await $.command.run({ command: 'cache-lang', args: 'xx' })
    expect(usage.text).toBe(MESSAGES[lang].langUsage(LANGS.join(', ')))
    for (const code of LANGS) expect(usage.text).toContain(code)
    for (const code of LANGS) {
      const pinned = await $.command.run({ command: 'cache-lang', args: MESSAGES[code].name })
      expect(pinned.text).toBe(MESSAGES[code].langNow(MESSAGES[code].name, 'pinned'))
    }
  })

  test(lang + ' band and panel pass the catalog language to every drawing', { timeoutMs: 30_000 }, async ($, on) => {
    mock.clock(on, { now: 1_700_000_000_000 })
    mock.store(on, { lang })
    mock.env(on, { CLAUDE_CODE_PROMPT_CACHE_TTL: '1h' })
    on('turn.step', async function* (_, e) {
      return {
        turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn',
        usage: { input_tokens: 12, output_tokens: 300, cache_read_input_tokens: 80_000, cache_creation_input_tokens: 0, model: 'claude-sonnet-5-5' },
      }
    })
    on('ui.render', { component: 'AbovePrompt' }, (inner, e) => inner.ui.resolve(e).Box({}))
    const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet-5-5', messageCount: 1 })
    for await (const _ of step) void _
    await step.result
    const band = await $.ui.mount({
      plugin: 'cache-context', surface: 'desktop', component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
    })
    const pane = await $.ui.mount({
      plugin: 'cache-context', surface: 'desktop', component: 'Pane', requestId: 'cache',
      props: { title: MESSAGES[lang].paneTitle, isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
    })
    const bandDrawings = await band.findAll({ type: 'Svg' })
    const paneDrawings = await pane.findAll({ type: 'Svg' })
    expect(bandDrawings).toHaveLength(1)
    // Splitting the card into ring, figure and costs adds two drawings.
    expect(paneDrawings).toHaveLength(9)
    for (const drawing of [...bandDrawings, ...paneDrawings]) {
      const source = String(drawing.props.source)
      const m = MESSAGES[lang]
      expect(source).toContain('lang="' + m.tag + '"')
      if (drawing.props.height !== 1) {
        expect(source).toContain('font-family:system-ui, -apple-system' + (m.fonts ? ', ' + m.fonts : '') + ', sans-serif')
      }
    }
    await band.unmount()
    await pane.unmount()
  })
}
