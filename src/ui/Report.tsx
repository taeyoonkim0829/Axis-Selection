import { useState, type ReactNode } from 'react'
import type { AxisEvaluation } from '../calc/axisSelection'
import type { KitMatch } from '../calc/kitSelection'
import { accelTimeFor } from '../calc/motionProfile'
import { gearboxChecks, gearboxStatus, type DriveEvaluation } from '../calc/motorSelection'
import { verticalForward, type Requirements, type Settings, type Status } from '../calc/types'
import type { KitEvaluation } from '../calc/kitSelection'
import { assemblyWarnings, connectorSide, drivePositionWords, shaftDrivePosition, twinOrientation, type ComboOptions } from '../cad/combo'
import { axisDrawingsFor } from '../cad/drawings'
import { translateData, useLang, useT } from '../i18n'
import { CheckTable, StatusBadge } from './common'
import { DrivePackage } from './DrivePackage'
import { KitNotes } from './KitStep'
import {
  axisDetailChecks,
  cableRoleLabel,
  driveLabel,
  fmt,
  kgf,
  mountingLabel,
  moveLabel,
  parallelModeLabel,
  pressDirectionLabel,
  sideLabel,
} from './format'
import { ProfileNumbers } from './MotionProfile'
import { ProfilePlot, type ProfileView } from './ProfileChart'

interface Props {
  req: Requirements
  settings: Settings
  axis: AxisEvaluation
  drive: DriveEvaluation | null
  /** Direct drive plus every compatible gearbox for the selected motor */
  kitMatch: KitMatch | null
  kit: KitEvaluation | null
  /** Motion profile view selected on screen */
  profileView: ProfileView
  /** assembly orientation chosen in step 5 */
  assembly: ComboOptions
  /** Gantry: which axis this report is for and what it carries (labels are Korean source text) */
  gantry?: { axis: string; rows: [string, string][] }
}

type Row = [label: string, value: ReactNode]

/** Label/value pairs, two pairs per table row. Labels are Korean source text, translated here. */
function SpecTable({ rows }: { rows: Row[] }) {
  const t = useT()
  const pairs: Row[][] = []
  for (let i = 0; i < rows.length; i += 2) pairs.push(rows.slice(i, i + 2))
  return (
    <table className="report-spec">
      <tbody>
        {pairs.map((pair) => (
          <tr key={pair[0][0]}>
            {pair.map(([label, value]) => (
              <Cell key={label} label={t(label)} value={value} />
            ))}
            {pair.length === 1 && <td colSpan={2} />}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Cell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <th>{label}</th>
      <td>{value ?? '—'}</td>
    </>
  )
}

/** Number with unit, or a dash when missing. */
function q(value: number | null | undefined, unit: string, digits = 3): string {
  return value == null ? '—' : `${fmt(value, digits)} ${unit}`
}

function Chapter({ no, title, children }: { no: number; title: string; children: ReactNode }) {
  return (
    <section className="report-chapter">
      <h2>
        <span className="step-no">{no}</span> {title}
      </h2>
      {children}
    </section>
  )
}

export function Report({ req, settings, axis, drive, kitMatch, kit: kitEval, profileView, assembly, gantry }: Props) {
  const kit = kitEval?.kit ?? null
  const t = useT()
  const lang = useLang()
  const a = axis.axis
  const g = drive?.gearbox ?? null
  const vertical = verticalForward(req)
  // belt axes: where the drive head and motor sit, as chosen in step 5
  const beltMeta = axis?.axis.drive === 'belt' ? (axisDrawingsFor(axis.axis, axis.order.stroke ?? req.stroke)[0]?.meta ?? null) : null
  // with a connecting shaft the motor sits on the shaft end away from the second axis, as in step 5
  const drivePosition =
    beltMeta && axis?.layout.mode === 'twinShaft' ? shaftDrivePosition(beltMeta, req.mounting, assembly.drive) : assembly.drive
  const words = beltMeta ? drivePositionWords(beltMeta, req.mounting, drivePosition) : null
  const motorPosition = words ? `${t(words.end)} · ${t(words.side)}` : null
  // motor sync: the second axis's motor position, as in step 5
  const twinWords =
    beltMeta && axis?.layout.mode === 'twinMotor'
      ? drivePositionWords(beltMeta, req.mounting, assembly.twinDrive ?? drivePosition)
      : null
  const twinMotorPosition = twinWords ? `${t(twinWords.end)} · ${t(twinWords.side)}` : null
  // motor sync: the second axis's kit side and connector, as in step 5
  const twinAssembly = axis?.layout.mode === 'twinMotor' ? twinOrientation(assembly) : null
  const times = t('배')
  const [today] = useState(() => new Date().toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US'))
  const layout = axis.layout
  // Quantities: two axes in a twin arrangement; one drive train per motor
  const nAxes = layout.axes
  const nDrive = drive ? layout.motors : null
  type SelectionRow = [string, string, string, string | null, number | null, Status | null]
  const selection: SelectionRow[] = [
    [t('직교 축'), 'Festo', axis.order.model, axis.order.partNumber, nAxes, axis.status],
    [
      t('모터'),
      drive?.motor.maker ?? '—',
      drive ? (drive.motor.orderCode ?? drive.motor.model) : t('선택 안 됨'),
      drive?.motor.partNumber ?? null,
      nDrive,
      drive?.status ?? null,
    ],
    // Festo drive package: drive, cables, external braking resistor
    ...(drive?.controller?.controller
      ? ([[t('서보 드라이브'), 'Festo', drive.controller.controller.model, drive.controller.controller.partNumber, nDrive, drive.controller.status]] as SelectionRow[])
      : []),
    ...(drive?.controller?.cables ?? []).map(
      (c): SelectionRow => [t(cableRoleLabel[c.role]), 'Festo', c.type, c.partNumber, nDrive, null],
    ),
    ...(drive?.controller?.resistor.item && drive.controller.resistor.required
      ? ([[t('제동저항'), 'Festo', drive.controller.resistor.item.model, drive.controller.resistor.item.partNumber, nDrive, null]] as SelectionRow[])
      : []),
    [
      t('감속기'),
      g?.maker ?? '—',
      drive ? (g ? `${g.model} (${g.ratio}:1)` : t('감속기 미사용')) : '—',
      g?.partNumber ?? null,
      g ? nDrive : null,
      drive ? gearboxStatus(drive) : null,
    ],
    [
      t('연결키트'),
      kit ? 'Festo' : '—',
      kit?.product ?? (drive ? t('해당 키트 없음') : '—'),
      kit?.partNumber ?? null,
      kit ? nDrive : null,
      kitEval?.status ?? null,
    ],
    ...(layout.guides
      ? ([[t('LM 가이드'), '—', t('별도 선정 (참고값: 3장)'), null, layout.guides, null]] as SelectionRow[])
      : []),
    ...(axis.shaft ? ([[t('연결축'), 'Festo', axis.shaft.model, axis.shaft.shaft.partNumber, 1, null]] as SelectionRow[]) : []),
  ]
  const noMotor = <p className="empty">{t('모터를 선택하지 않았습니다.')}</p>

  return (
    <div className="report">
      <Chapter no={1} title={t('입력 데이터 · 선정 모델')}>
        <p className="report-meta">{t('직교 축 선정 계산서 · {date}', { date: today })}</p>

        {gantry && (
          <>
            <h3>{t('조합축 {axis}', { axis: gantry.axis })}</h3>
            <SpecTable rows={gantry.rows} />
          </>
        )}

        <h3>{t('사용 조건')}</h3>
        <SpecTable
          rows={[
            ['축 설치 방향', t(mountingLabel[req.mounting])],
            ['스트로크', q(req.stroke, 'mm')],
            ['하중', q(req.payload, 'kg')],
            ['속도', q(req.velocity, 'm/s')],
            ['가속도', q(req.acceleration, 'm/s²')],
            ['가속 시간', q(accelTimeFor(req.velocity, req.acceleration, req.jerk), 's')],
            ['저크', req.jerk > 0 ? q(req.jerk, 'm/s³') : t('제한 없음 (사다리꼴)')],
            ['휴지 시간', q(settings.dwellTime, 's')],
            ['어플리케이션', t(axis.press ? '프레싱' : '일반')],
            ...(axis.press
              ? ([
                  ...(vertical ? [['압착 방향', t(pressDirectionLabel[req.press!.direction])] as Row] : []),
                  ['압착력', `${q(axis.press.force, 'N')} (${kgf(axis.press.force)})`],
                  ['압착 구간', q(axis.press.distance, 'mm')],
                  ['압착 속도', q(req.press!.speed, 'm/s')],
                  ['가압 유지 시간', q(axis.press.holdTime, 's')],
                ] as Row[])
              : []),
            ['무게 중심 X / Y / Z', `${fmt(req.cog.x)} / ${fmt(req.cog.y)} / ${fmt(req.cog.z)} mm`],
            ['축 구성', t(parallelModeLabel[layout.mode])],
            ...(layout.mode !== 'single'
              ? ([
                  [layout.guides ? '축–가이드 간격' : '축 간격', q(req.parallel!.spacing, 'mm')],
                  ...(layout.guides
                    ? ([
                        [
                          'LM 가이드 수',
                          layout.guides === 2
                            ? t(layout.isAxis[0] ? '2개 · 축 가장자리' : '2개 · 축 가운데')
                            : t('1개'),
                        ],
                        ['가이드 1개 이동 질량', q(req.parallel!.guideMass, 'kg')],
                      ] as Row[])
                    : ([['축 1개 부하 분담', `${Math.round(layout.share * 100)}%`]] as Row[])),
                  ...(layout.mode === 'twinShaft'
                    ? ((axis.shaft
                        ? [
                            ['연결축', `${axis.shaft.model} (LN ${axis.shaft.length} mm)`],
                            ['연결축 관성', q(axis.shaft.inertia, 'kg·cm²', 4)],
                          ]
                        : [['연결축 관성', q(layout.shaftInertia, 'kg·cm²', 4)]]) as Row[])
                    : []),
                ] as Row[])
              : []),
          ]}
        />

        <h3>{t('상세 설정')}</h3>
        <SpecTable
          rows={[
            ['구동 효율 (볼스크류 / 벨트)', `${fmt(settings.efficiency.spindle)} / ${fmt(settings.efficiency.belt)}`],
            ['마찰 계수 (볼스크류 / 벨트)', `${fmt(settings.friction.spindle)} / ${fmt(settings.friction.belt)}`],
            ['외부 반력 Fc', q(settings.externalForce, 'N')],
            ['가이드 저항 FG', q(settings.guideResistance, 'N')],
            ['커플링 관성', q(settings.couplingInertia, 'kg·cm²', 4)],
            ['기본 허용 관성비', q(settings.defaultInertiaRatio, times)],
            ['지지 간격', settings.supportSpan > 0 ? q(settings.supportSpan, 'mm') : t('양 끝만 지지')],
            ['일 가동 시간', q(settings.hoursPerDay, 'h')],
            ['브레이크', settings.requireBrake ? t('필요') : t('선택')],
            ['감속기', settings.useGearbox ? t('감속기 사용') : t('감속기 미사용')],
            ...(axis.axis.family === 'ESBF'
              ? ([['ESBF 외부 가이드', settings.externalGuide ? t('사용 (로드 횡하중 검토 생략)') : t('미사용')]] as Row[])
              : []),
          ]}
        />

        <h3>{t('선정 모델')}</h3>
        <table className="report-table">
          <thead>
            <tr>
              <th>{t('구분')}</th>
              <th>{t('메이커')}</th>
              <th>{t('모델명')}</th>
              <th>{t('주문번호')}</th>
              <th>{t('수량')}</th>
              <th>{t('판정')}</th>
            </tr>
          </thead>
          <tbody>
            {selection.map(([part, maker, model, partNumber, count, status]) => (
              <tr key={part}>
                <td>{part}</td>
                <td>{maker}</td>
                <td className="model">{model}</td>
                <td>{partNumber ?? '—'}</td>
                <td>{count ?? '—'}</td>
                <td>{status ? <StatusBadge status={status} /> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Chapter>

      <Chapter no={2} title={t('모션 프로파일')}>
        <ProfileNumbers axis={axis} />
        <figure className="profile-chart report-chart">
          <figcaption>
            {t(profileView === 'cycle' ? '왕복' : moveLabel(profileView === 'back', vertical))}
            {profileView !== 'back' && axis.press ? ` + ${t('압착')}` : ''}
            {settings.dwellTime > 0 ? ` + ${t('휴지')}` : ''} ({t('가로축 시간 s')})
          </figcaption>
          <ProfilePlot axis={axis} drive={drive} settings={settings} view={profileView} />
        </figure>
      </Chapter>

      <Chapter no={3} title={t('축 선정 세부사항')}>
        <h3>{axis.order.model}</h3>
        <SpecTable
          rows={[
            ...(axis.order.stroke != null
              ? ([
                  ['주문번호', axis.order.partNumber ?? '—'],
                  [
                    '주문 스트로크',
                    `${q(axis.order.stroke, 'mm')}${axis.order.modular ? ` (${t('모듈러 제품, 모듈 번호로 주문')})` : ''}`,
                  ],
                ] as Row[])
              : []),
            ...(axis.options && a.additionalSlide
              ? ([['추가 슬라이드', axis.options.slides.length ? axis.options.slides.join(' + ') : t('없음')]] as Row[])
              : []),
            ...(axis.options?.belt ? ([['벨트 재질', axis.options.belt.code ?? t('클로로프렌')]] as Row[]) : []),
            ['제품군', [a.family, a.variant].filter(Boolean).join('-')],
            ['구동 방식', t(driveLabel[a.drive])],
            ['최대 스트로크', q(a.maxStroke, 'mm')],
            ['최대 속도', q(a.maxSpeed, 'm/s')],
            ['최대 가속도', q(a.maxAcceleration, 'm/s²')],
            ['최대 이송력', q(a.maxFeedForce, 'N')],
            ['무부하 구동 토크', q(axis.noLoadTorque, 'Nm')],
            ['최대 구동 토크', q(a.maxDrivingTorque, 'Nm')],
            ['회전당 이송량', q(axis.feed, 'mm/rev')],
            ['반복 정밀도', a.repeatability == null ? '—' : `±${fmt(a.repeatability, 3)} mm`],
            ['이동 질량 (소재 + 슬라이드)', q(axis.movingMass, 'kg')],
            ['축 질량', q(axis.axisMass, 'kg')],
            ['구동축 환산 관성', q(axis.inertia, 'kg·cm²', 4)],
            ['구동 효율', fmt(axis.efficiency)],
            ['인터페이스 코드', a.interfaceCode ?? '—'],
          ]}
        />
        <h3>{t('검토 항목')}</h3>
        <CheckTable checks={axisDetailChecks(axis)} />
        {axis.info.length > 0 && (
          <>
            <h3>{t('참고값')}</h3>
            <SpecTable
              rows={axis.info.map((i): Row => {
                const text = `${q(i.value, i.unit)}${i.note ? ` (${t(i.note, i.noteArgs)})` : ''}`
                return [i.label, i.alert ? <span key={i.label} className="fail-text">{text}</span> : text]
              })}
            />
          </>
        )}
      </Chapter>

      <Chapter no={4} title={t('모터 선정 세부사항')}>
        {!drive ? (
          noMotor
        ) : (
          <>
            <h3>
              {drive.motor.maker} {drive.motor.model}
            </h3>
            <SpecTable
              rows={[
                [
                  '시리즈',
                  translateData(lang, [drive.motor.series, drive.motor.description].filter(Boolean).join(' · ')) || '—',
                ],
                ['브레이크', drive.motor.brake ? t('있음') : t('없음')],
                ...(drive.motor.orderCode
                  ? ([
                      ['주문 형식', drive.motor.orderCode],
                      ['주문번호', drive.motor.partNumber ?? '—'],
                    ] as Row[])
                  : []),
                ['정격 출력', q(drive.motor.ratedPower, 'W', 0)],
                ['정격 / 최대 토크', `${fmt(drive.motor.ratedTorque, 3)} / ${fmt(drive.motor.peakTorque, 3)} Nm`],
                ['정격 / 최대 회전수', `${fmt(drive.motor.ratedSpeed, 0)} / ${fmt(drive.motor.maxSpeed, 0)} rpm`],
                ['로터 관성', q(drive.motor.inertia, 'kg·cm²', 4)],
                ['허용 관성비', q(drive.motor.allowableInertiaRatio, times)],
                ['허용 회생 전력', q(drive.motor.regenPower, 'W')],
                ['앰프', drive.motor.amplifier ?? '—'],
                ['인터페이스 코드', drive.motor.interfaceCode ?? '—'],
              ]}
            />
            <h3>
              {g
                ? t('운전 결과 (감속기 {model} {ratio}:1 포함)', { model: g.model, ratio: g.ratio })
                : t('운전 결과 (감속기 미사용)')}
            </h3>
            <SpecTable
              rows={[
                ['최대 토크', q(drive.peakTorque, 'Nm')],
                ['실효 토크', q(drive.rmsTorque, 'Nm')],
                ['최대 회전수', q(drive.maxMotorSpeed, 'rpm', 0)],
                ['관성비', q(drive.inertiaRatio, times)],
                ['회생 전력 (사이클 평균)', q(drive.regenPower, 'W')],
              ]}
            />
            <h3>{t('검토 항목')}</h3>
            <CheckTable checks={drive.checks} />
          </>
        )}
      </Chapter>

      {drive?.controller && (
        <Chapter no={4} title={t('드라이브 · 케이블 · 제동저항')}>
          <DrivePackage selection={drive.controller} cableLength={settings.cableLength} hideTitle />
        </Chapter>
      )}

      <Chapter no={5} title={t('감속기 세부사항')}>
        {!drive ? (
          noMotor
        ) : (
          <>
            {g ? (
              <>
                <h3>
                  {g.maker} {g.model}
                </h3>
                <SpecTable
                  rows={[
                    ['감속비', `${g.ratio}:1`],
                    ['주문번호', g.partNumber ?? '—'],
                    ['단수', g.stage == null ? '—' : t('{n}단', { n: g.stage })],
                    ['플랜지 크기', q(g.flangeSize, 'mm', 0)],
                    ['정격 출력 토크', q(g.continuousTorque, 'Nm')],
                    ['최대 출력 토크', q(g.maxTorque, 'Nm')],
                    ['최대 입력 회전수', q(g.maxInputSpeed, 'rpm', 0)],
                    ['관성 (입력측)', q(g.inertia, 'kg·cm²', 4)],
                    ['효율', q(g.efficiency, '%', 1)],
                    ['인터페이스 코드 (출력측)', g.interfaceCode ?? '—'],
                  ]}
                />
                <h3>{t('검토 항목')}</h3>
                <CheckTable checks={gearboxChecks(drive)} />
              </>
            ) : (
              <p className="report-note">{t('감속기를 사용하지 않습니다 (축 - 연결키트 - 모터).')}</p>
            )}
          </>
        )}
      </Chapter>

      <Chapter no={6} title={t('연결키트 세부사항')}>
        {!kitMatch ? (
          noMotor
        ) : (
          <>
            <SpecTable
              rows={[
                ['축 인터페이스 코드', kitMatch.axisCode ?? '—'],
                [
                  kitMatch.motorSide === 'gearbox' ? '감속기 (출력측) 인터페이스 코드' : '모터 인터페이스 코드',
                  kitMatch.motorCode ?? '—',
                ],
              ]}
            />
            {kit ? (
              <>
                <h3>{kit.product}</h3>
                <SpecTable
                  rows={[
                    ['주문번호', kit.partNumber ?? '—'],
                    ['종류', t(kit.type === 'axial' ? '직렬 키트' : '병렬 키트')],
                    ['견시창', kit.window ? t('있음') : t('없음')],
                    kit.type === 'axial' ? ['커플링', kit.coupling ?? '—'] : ['풀리 품번', kit.pulley ?? '—'],
                    ['전달 토크', kit.transmissibleTorque != null ? q(kit.transmissibleTorque, 'Nm') : '—'],
                    ['관성 모멘트', kit.inertia != null ? q(kit.inertia, 'kg·cm²') : '—'],
                    ['최대 회전수', kit.maxSpeed != null ? q(kit.maxSpeed, 'rpm') : '—'],
                    ...(kit.noLoadTorque != null ? ([['무부하 토크', q(kit.noLoadTorque, 'Nm')]] as Row[]) : []),
                    ...(motorPosition && twinMotorPosition
                      ? ([
                          ['모터 위치 (첫 번째 축, 정면도 기준)', motorPosition],
                          ['모터 위치 (두 번째 축, 정면도 기준)', twinMotorPosition],
                        ] as Row[])
                      : motorPosition
                        ? ([['모터 위치 (정면도 기준)', motorPosition]] as Row[])
                        : []),
                    ...(kit.type === 'parallel'
                      ? ([
                          [twinAssembly ? '키트 조립 방향 (첫 번째 축, 모터 위치)' : '키트 조립 방향 (모터 위치)', t(sideLabel[assembly.kitSide])],
                        ] as Row[])
                      : []),
                    [
                      twinAssembly ? '모터 조립 방향 (첫 번째 축, 커넥터)' : '모터 조립 방향 (커넥터)',
                      t(sideLabel[connectorSide(assembly, kit.type === 'parallel')]),
                    ],
                    ...(twinAssembly && kit.type === 'parallel'
                      ? ([['키트 조립 방향 (두 번째 축, 모터 위치)', t(sideLabel[twinAssembly.kitSide])]] as Row[])
                      : []),
                    ...(twinAssembly
                      ? ([
                          ['모터 조립 방향 (두 번째 축, 커넥터)', t(sideLabel[connectorSide(twinAssembly, kit.type === 'parallel')])],
                        ] as Row[])
                      : []),
                  ]}
                />
                <p className="report-note">{t('모터 쪽 축 끝에서 축을 바라볼 때 기준이며, 슬라이드 면이 상입니다.')}</p>
                {[
                  ...new Set([
                    ...assemblyWarnings(assembly, kit.type === 'parallel'),
                    ...(twinAssembly ? assemblyWarnings(twinAssembly, kit.type === 'parallel') : []),
                  ]),
                ].map((w) => (
                  <p key={w} className="report-note warn-text">
                    {t(w)}
                  </p>
                ))}
                {kitEval && <CheckTable checks={kitEval.checks} />}
                {kitEval && kitEval.notes.length > 0 && <KitNotes notes={kitEval.notes} />}
              </>
            ) : (
              <p className="report-note">{t('조건에 맞는 연결키트가 없습니다.')}</p>
            )}
          </>
        )}
      </Chapter>
    </div>
  )
}
