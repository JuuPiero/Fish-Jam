// The gameplay background's body (BG Image) with its seaweed set swaying. The seaweed is painted into the picture, so
// nothing is a separate object: a small mask texture says where each clump is and how far up it a pixel sits, and the
// picture is read a little to one side of where it should be, more so towards the tips. Everything else samples the
// picture unchanged (one branch on the mask, so the cost over the stock UI shader is one sample of a tiny texture).
//
// _MaskTex (baked from the picture's clumps, bilinear, linear colour):
//   R  sway weight: 0 at a clump's root, rising to 1 at its tip, held a little beyond the tip so a leaf that sways
//      out still has room to be drawn; 0 outside every clump and over bright sand (light sand must not be dragged along)
//   B  the clump's strength, 0.5 + B (0.5..1.5 of _Amplitude), blended by weight where clumps overlap
//   G  unused
// The phase is NOT stored per clump: where two clumps overlap, a phase that jumps from one to the other tears a leaf
// in two, so it is a smooth function of the picture's x (_PhaseX) and clumps at different places are out of step anyway.
// Each pixel sways on two sines (the second a faster, smaller one running up the leaf at another rate) plus a slow
// surge shared by all clumps, which is what makes the whole bed read as one current moving the water.
// _TimeOffset is added to the clock so an Editor eval can render a chosen moment.
Shader "FishJam/UI/BackgroundSeaweed"
{
    Properties
    {
        [PerRendererData] _MainTex ("Picture", 2D) = "white" {}
        _Color ("Tint", Color) = (1,1,1,1)
        [NoScaleOffset] _MaskTex ("Sway mask (R weight, B strength)", 2D) = "black" {}
        _Amplitude ("Sway at a tip, in uv x (0.008 = about 14 px of the 1800 px picture)", Float) = 0.008
        _Speed ("Speed", Float) = 1
        _WaveLength ("Phase along the height (radians per unit of v)", Float) = 40
        _PhaseX ("Phase across the width (radians per unit of u): how far apart clumps are out of step", Float) = 9
        _Surge ("Shared current, share of the amplitude", Range(0, 1)) = 0.5
        _TimeOffset ("Time offset", Float) = 0
    }

    SubShader
    {
        Tags
        {
            "Queue"="Transparent"
            "IgnoreProjector"="True"
            "RenderType"="Transparent"
            "PreviewType"="Plane"
            "CanUseSpriteAtlas"="True"
        }

        Cull Off
        Lighting Off
        ZWrite Off
        ZTest [unity_GUIZTestMode]
        Blend SrcAlpha OneMinusSrcAlpha

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 2.0
            #include "UnityCG.cginc"

            struct appdata_t
            {
                float4 vertex : POSITION;
                float4 color : COLOR;
                float2 texcoord : TEXCOORD0;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct v2f
            {
                float4 vertex : SV_POSITION;
                fixed4 color : COLOR;
                float2 uv : TEXCOORD0;
                UNITY_VERTEX_OUTPUT_STEREO
            };

            sampler2D _MainTex;
            sampler2D _MaskTex;
            fixed4 _Color;
            float _Amplitude;
            float _Speed;
            float _WaveLength;
            float _PhaseX;
            float _Surge;
            float _TimeOffset;

            v2f vert(appdata_t v)
            {
                v2f o;
                UNITY_SETUP_INSTANCE_ID(v);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(o);
                o.vertex = UnityObjectToClipPos(v.vertex);
                o.uv = v.texcoord;
                o.color = v.color * _Color;
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float3 m = tex2D(_MaskTex, i.uv).rgb;
                float2 uv = i.uv;

                // Most of the picture is not seaweed: skip the maths there.
                if (m.r > 0.002)
                {
                    float t = (_Time.y + _TimeOffset) * _Speed;
                    float phase = i.uv.x * _PhaseX;

                    // A sway along the leaf (the phase runs up with v, so a leaf bends in an S rather than leaning
                    // as a rod), a quicker flutter on top, and the slow current the whole bed shares.
                    float sway = sin(t * 1.15 + phase + i.uv.y * _WaveLength)
                               + 0.35 * sin(t * 2.45 + phase * 1.7 + i.uv.x * 23.0 + i.uv.y * _WaveLength * 1.7);
                    float surge = sin(t * 0.55 + i.uv.y * 6.0 + i.uv.x * 3.0);
                    float dx = m.r * (m.b + 0.5) * _Amplitude * (sway * (1.0 - 0.5 * _Surge) + surge * _Surge * 1.5);

                    uv.x -= dx;
                }

                fixed4 col = tex2D(_MainTex, uv) * i.color;
                return col;
            }
            ENDCG
        }
    }
}
