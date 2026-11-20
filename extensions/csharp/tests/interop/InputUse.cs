// A real extension with names Cocos also has: input-system (db://input-system/index) of CocosGoat.
// - Ext.InputSystem has a class InputSystem: `using Ext.InputSystem;` then InputSystem.frame works.
// - Ext.InputSystem.Input and cc.Input (a global using): the file's alias wins, no CS0104.
using cc;
using static cc.Globals;
using Ext.InputSystem;
using Input = Ext.InputSystem.Input;

public class InputUse : Component
{
    protected override void update(double dt)
    {
        if (Input.getKeyDown((int)KeyCode.SPACE)) log("space at frame " + InputSystem.frame + ", axis " + Input.getAxis("Horizontal"));
        // Cocos' own Input stays reachable by its full name
        cc.Input cocosInput = input;
        if (cocosInput == null) log("no cc.input");
    }
}
