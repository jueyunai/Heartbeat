import { NextRequest, NextResponse } from "next/server";
import { checkAllTargets, checkTarget, findTargetById, getTargets } from "@/lib/checker";

function serializeTargets() {
  return getTargets().map(({ id, name, providerType, models }) => ({
    id,
    name,
    providerType,
    models,
  }));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const mode = body?.mode;
    const targetId = body?.targetId;

    if (mode !== "all" && mode !== "one") {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "BAD_REQUEST",
            message: "mode 仅支持 all 或 one",
          },
        },
        { status: 400 },
      );
    }

    if (mode === "one") {
      if (!targetId || typeof targetId !== "string") {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "BAD_REQUEST",
              message: "单项检测必须提供合法的 targetId",
            },
          },
          { status: 400 },
        );
      }

      const target = findTargetById(targetId);

      if (!target) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "TARGET_NOT_FOUND",
              message: "未找到对应检测目标",
            },
          },
          { status: 404 },
        );
      }

      const results = await checkTarget(target);
      return NextResponse.json({
        ok: true,
        timestamp: new Date().toISOString(),
        targets: serializeTargets(),
        results,
      });
    }

    const results = await checkAllTargets();
    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      targets: serializeTargets(),
      results,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "服务端处理检测请求时发生异常",
        },
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    targets: serializeTargets(),
  });
}
