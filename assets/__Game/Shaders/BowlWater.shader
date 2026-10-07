// Water surface for the order bowl's body sprite (Order.prefab > ic_botle > MainSprite). The water is
// painted into the art, so this does not draw any: it moves what is painted. Inside a band around the
// waterline the sprite is sampled a little higher or lower along a travelling wave, which makes the
// painted surface ripple, and two narrow glints slide along it. Everything outside the band, and the
// strip near the bowl's sides, is the plain sprite, so the glass rim never wobbles.
//
// The band is placed in the sprite's LOCAL space (_WaterLevel, _Band, _HalfWidth): the sprite sits in
// an atlas in a player (Play Mode packs it, Edit Mode reads the original texture), so its uv is a
// sub-rect there and cannot say where the water is. The wave's size in local units is turned into a uv
// offset with the screen-space derivatives of uv and local position, which holds for either texture.
//
// HLSL on URP's Core with every property in UnityPerMaterial, written the way Bubble Sprite was ported,
// so the bowls draw as one SRP batch (the clock is _Time, no per-bowl material). The bowls are spread
// out of step by the world x of the pixel, which is continuous across them.
//
// The numbers are for Group 1_0 (252x241 px at 100 PPU, pivot in the middle, so local y 1.205 is its top):
// the painted surface sits 0.6-0.9 below the top at the centre and a little lower at the sides.
Shader "FishJam/Bowl Water"
{
    Properties
    {
        [PerRendererData] _MainTex ("Sprite Texture", 2D) = "white" {}
        _Color ("Tint", Color) = (1,1,1,1)

        [Header(Water line)]
        _WaterLevel ("Waterline (local y)", Float) = 0.48
        _Band ("Band Half Height", Range(0.02, 0.6)) = 0.2
        _HalfWidth ("Bowl Half Width", Float) = 1.26
        _EdgeFade ("Edge Fade Start", Range(0, 0.99)) = 0.7

        [Header(Waves)]
        _WaveAmp ("Wave Amplitude (local units)", Range(0, 0.05)) = 0.03
        _WaveFreq ("Wave Frequency", Range(0, 12)) = 4.5
        _WaveSpeed ("Wave Speed", Range(0, 6)) = 1.6
        _WorldPhase ("Phase By World X", Float) = 0.9

        [Header(Glints)]
        _GlintStrength ("Glint Strength", Range(0, 2)) = 0.45
        _GlintFreq ("Glint Frequency", Range(0, 6)) = 1.4
        _GlintSpeed ("Glint Speed", Range(-3, 3)) = 0.7
        _GlintSharp ("Glint Sharpness", Range(1, 32)) = 10

        // Kept so a sprite renderer that writes them (flip, external alpha) finds the properties.
        [HideInInspector] [MaterialToggle] PixelSnap ("Pixel snap", Float) = 0
        [HideInInspector] _RendererColor ("RendererColor", Color) = (1,1,1,1)
        [HideInInspector] _Flip ("Flip", Vector) = (1,1,1,1)
        [HideInInspector] [PerRendererData] _AlphaTex ("External Alpha", 2D) = "white" {}
        [HideInInspector] [PerRendererData] _EnableExternalAlpha ("Enable External Alpha", Float) = 0
    }

    SubShader
    {
        Tags
        {
            "Queue"="Transparent"
            "RenderType"="Transparent"
            "RenderPipeline"="UniversalPipeline"
            "IgnoreProjector"="True"
            "PreviewType"="Plane"
            "CanUseSpriteAtlas"="True"
        }

        Cull Off
        ZWrite Off
        Blend One OneMinusSrcAlpha

        Pass
        {
            HLSLPROGRAM
            #pragma vertex WaterVert
            #pragma fragment WaterFrag
            #pragma multi_compile_instancing

            #include "Packages/com.unity.render-pipelines.universal/Shaders/2D/Include/Core2D.hlsl"

            TEXTURE2D(_MainTex);
            SAMPLER(sampler_MainTex);

            CBUFFER_START(UnityPerMaterial)
                half4 _Color;

                float _WaterLevel;
                float _Band;
                float _HalfWidth;
                float _EdgeFade;

                float _WaveAmp;
                float _WaveFreq;
                float _WaveSpeed;
                float _WorldPhase;

                half _GlintStrength;
                float _GlintFreq;
                float _GlintSpeed;
                float _GlintSharp;
            CBUFFER_END

            struct Attributes
            {
                float3 positionOS : POSITION;
                float2 uv         : TEXCOORD0;
                half4  color      : COLOR;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                half4  color      : COLOR;
                float2 uv         : TEXCOORD0;
                float2 localPos   : TEXCOORD1;
                float  worldX     : TEXCOORD2;
                UNITY_VERTEX_OUTPUT_STEREO
            };

            Varyings WaterVert(Attributes input)
            {
                Varyings output = (Varyings)0;

                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(output);
                SetUpSpriteInstanceProperties();

                float3 pos = UnityFlipSprite(input.positionOS, unity_SpriteProps.xy);
                output.positionCS = TransformObjectToHClip(pos);
                output.localPos = pos.xy;
                output.worldX = TransformObjectToWorld(pos).x;
                output.uv = input.uv;
                output.color = input.color * _Color * unity_SpriteColor;

                return output;
            }

            half4 WaterFrag(Varyings input) : SV_Target
            {
                float2 p = input.localPos;

                float t = _Time.y * _WaveSpeed + input.worldX * _WorldPhase;
                float k = p.x * _WaveFreq;
                // Two sines with unrelated frequencies, so the period does not show.
                float wave = sin(k + t) * 0.6 + sin(k * 1.9 - t * 1.3 + 1.7) * 0.4;

                // 1 on the waterline, 0 at the band's ends and in the strip along the bowl's sides.
                float band = 1.0 - smoothstep(0.0, 1.0, abs(p.y - _WaterLevel) / _Band);
                float side = 1.0 - smoothstep(_EdgeFade, 1.0, abs(p.x) / _HalfWidth);
                float w = band * side;

                // uv change for one local unit up: solve [d(local)/d(screen)] * s = (0, 1) for the
                // screen step s, then read uv along it. The sprite is a plain quad, so this is constant.
                float2 dpx = ddx(p);
                float2 dpy = ddy(p);
                float det = dpx.x * dpy.y - dpx.y * dpy.x;
                float2 duvdy = abs(det) > 1e-12
                    ? (ddx(input.uv) * -dpy.x + ddy(input.uv) * dpx.x) / det
                    : float2(0.0, 0.0);

                float2 uv = input.uv + duvdy * (wave * _WaveAmp * w);
                half4 tex = SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, uv);

                half4 c;
                c.a = tex.a * input.color.a;
                c.rgb = tex.rgb * input.color.rgb * c.a;

                // Two glints sliding the other way along the surface.
                float g = _Time.y * _GlintSpeed;
                float g1 = pow(saturate(sin(p.x * _GlintFreq - g) * 0.5 + 0.5), _GlintSharp);
                float g2 = pow(saturate(sin(p.x * _GlintFreq * 0.63 + g * 1.4 + 2.0) * 0.5 + 0.5), _GlintSharp);
                // The sprite is premultiplied (Blend One OneMinusSrcAlpha): colour may not pass its alpha.
                c.rgb = min(c.rgb * (1.0 + _GlintStrength * w * (g1 + g2)), c.a);

                return c;
            }
            ENDHLSL
        }
    }
}
